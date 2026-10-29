import {
  BadRequestException,
  Global,
  Injectable,
  Logger,
  Module,
  OnModuleInit,
} from '@nestjs/common';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';

export interface StoredFile {
  fileKey: string;
  mimeType: string;
  sizeBytes: number;
}

/** How long the URLs embedded in list/detail responses stay valid (signed PDF links expire). */
export const EMBEDDED_URL_TTL_SECONDS = 30 * 60;

/**
 * Add a ready-to-open `url` to a stored-file record (anything with a `fileKey`),
 * so clients can show uploads straight from list/detail responses. A failure to
 * build one yields `url: null` rather than failing the whole response.
 */
export async function withFileUrl<T extends { fileKey: string }>(
  storage: Pick<StorageService, 'presignedGet'>,
  record: T,
): Promise<T & { url: string | null }> {
  try {
    return { ...record, url: await storage.presignedGet(record.fileKey, EMBEDDED_URL_TTL_SECONDS) };
  } catch {
    return { ...record, url: null };
  }
}

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];
const IMAGE_MIME_TYPES = ALLOWED_MIME_TYPES.filter((m) => m.startsWith('image/'));
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Chat media additionally allows voice notes and short videos. */
const CHAT_MEDIA_MIME_TYPES = [
  ...ALLOWED_MIME_TYPES,
  'audio/mpeg',
  'audio/mp4',
  'audio/webm',
  'audio/ogg',
  'video/mp4',
  'video/webm',
];
const AUDIO_VIDEO_EXTENSIONS = ['mp3', 'm4a', 'weba', 'webm', 'ogg', 'mp4'];
const CHAT_MEDIA_MAX_BYTES = 25 * 1024 * 1024;

/**
 * File storage backed by Cloudinary (TRD §7). Images are uploaded as public
 * `image` resources and PDFs as public `raw` resources (public_id ends in
 * `.pdf`), referenced by their Cloudinary public_id (`fileKey`). `presignedGet`
 * returns a URL the browser can open: the public delivery URL for images, and a
 * short-lived signed API download URL for PDFs (account-level PDF delivery is
 * blocked by default on Cloudinary, which makes plain raw URLs return 401).
 *
 * When Cloudinary credentials are absent (local dev without a Cloudinary account,
 * unit/e2e tests) the service falls back to an in-memory driver so uploads still
 * succeed without any external dependency.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly configured: boolean;
  private readonly folder: string;
  private readonly fallback = new Map<string, { buffer: Buffer; mimeType: string }>();

  constructor() {
    const cloudName = process.env['CLOUDINARY_CLOUD_NAME'];
    const apiKey = process.env['CLOUDINARY_API_KEY'];
    const apiSecret = process.env['CLOUDINARY_API_SECRET'];
    this.folder = process.env['CLOUDINARY_FOLDER'] ?? 'caresaath';
    this.configured = Boolean(cloudName && apiKey && apiSecret);

    if (this.configured) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
    }
  }

  onModuleInit(): void {
    this.logger.log(
      this.configured
        ? `Storage: Cloudinary (${process.env['CLOUDINARY_CLOUD_NAME']})`
        : 'Storage: in-memory fallback (set CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET to enable Cloudinary)',
    );
  }

  async put(
    prefix: string,
    filename: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<StoredFile> {
    this.validateUpload(mimeType, buffer.length);
    const isPdf = mimeType === 'application/pdf';
    const safeName = filename.replace(/[^\w.-]/g, '_');
    // Raw resources keep their extension in the public_id, so make sure PDFs have one.
    // Raw assets keep their extension in the public_id; for images Cloudinary treats a trailing
    // extension as the delivery format, so it is dropped to keep the id and URL unambiguous.
    const baseName = isPdf
      ? safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`
      : safeName.replace(/\.[A-Za-z0-9]+$/, '');
    const publicId = `${prefix}/${Date.now()}-${baseName}`;

    if (!this.configured) {
      this.fallback.set(publicId, { buffer, mimeType });
      return { fileKey: publicId, mimeType, sizeBytes: buffer.length };
    }

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          resource_type: isPdf ? 'raw' : 'image',
          folder: this.folder,
          overwrite: false,
        },
        (error, uploaded) => {
          if (error || !uploaded) {
            reject(error ?? new Error('Cloudinary upload failed'));
            return;
          }
          resolve(uploaded);
        },
      );
      stream.end(buffer);
    });

    return {
      fileKey: result.public_id,
      mimeType,
      sizeBytes: result.bytes ?? buffer.length,
    };
  }

  /** Resource type a stored key was uploaded as: PDFs are raw, audio/video keep their extension, everything else image. */
  resourceTypeFor(fileKey: string): 'image' | 'raw' | 'video' {
    const lower = fileKey.toLowerCase();
    if (lower.endsWith('.pdf')) return 'raw';
    if (AUDIO_VIDEO_EXTENSIONS.some((ext) => lower.endsWith(`.${ext}`))) return 'video';
    return 'image';
  }

  /** URL to view a stored file; PDFs get a signed download link valid for `ttlSeconds`. */
  async presignedGet(fileKey: string, ttlSeconds = 300): Promise<string> {
    if (!this.configured) {
      return `https://storage.local/${fileKey}?expires=${ttlSeconds}`;
    }
    const resourceType = this.resourceTypeFor(fileKey);
    if (resourceType === 'raw') {
      return cloudinary.utils.private_download_url(fileKey, '', {
        resource_type: 'raw',
        type: 'upload',
        expires_at: Math.floor(Date.now() / 1000) + ttlSeconds,
      });
    }
    if (resourceType === 'video') {
      // Cloudinary serves both audio and video notes under the 'video' resource type.
      return cloudinary.url(fileKey, { resource_type: 'video', type: 'upload', secure: true });
    }
    // Keys stored before extensions were stripped still end in one; it must be given as the format.
    const legacyExt = IMAGE_EXTENSIONS.find((ext) => fileKey.toLowerCase().endsWith(`.${ext}`));
    return cloudinary.url(fileKey, {
      resource_type: 'image',
      type: 'upload',
      secure: true,
      ...(legacyExt ? { format: legacyExt } : {}),
    });
  }

  /** Photos must be images; PDFs are only valid for documents. */
  validateImageUpload(mimetype: string, size: number): void {
    if (!IMAGE_MIME_TYPES.includes(mimetype)) {
      throw new BadRequestException('Only JPEG, PNG or WEBP images are allowed');
    }
    this.validateUpload(mimetype, size);
  }

  validateUpload(mimetype: string, size: number): void {
    if (!ALLOWED_MIME_TYPES.includes(mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, WEBP or PDF files are allowed');
    }
    if (size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException('File must be 10MB or smaller');
    }
  }

  /** Chat attachments: images, PDFs, voice notes, and short videos. */
  validateChatMediaUpload(mimetype: string, size: number): void {
    if (!CHAT_MEDIA_MIME_TYPES.includes(mimetype)) {
      throw new BadRequestException('Unsupported attachment type for chat');
    }
    if (size > CHAT_MEDIA_MAX_BYTES) {
      throw new BadRequestException(`File must be ${CHAT_MEDIA_MAX_BYTES / (1024 * 1024)}MB or smaller`);
    }
  }

  /** Resource type Cloudinary needs for an upload, from the mime type rather than a stored key's extension. */
  private resourceTypeForMime(mimeType: string): 'image' | 'raw' | 'video' {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('audio/') || mimeType.startsWith('video/')) return 'video';
    return 'raw';
  }

  /** Like `put`, but for chat attachments (image/voice/video/pdf), picking the right Cloudinary resource type. */
  async putChatMedia(
    prefix: string,
    filename: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<StoredFile> {
    this.validateChatMediaUpload(mimeType, buffer.length);
    const resourceType = this.resourceTypeForMime(mimeType);
    const isPdf = mimeType === 'application/pdf';
    const safeName = filename.replace(/[^\w.-]/g, '_');
    // Raw/video resources keep their extension in the public_id (needed to infer
    // the resource type back from the key alone); images drop it, same as `put`.
    const baseName =
      resourceType === 'image'
        ? safeName.replace(/\.[A-Za-z0-9]+$/, '')
        : isPdf
          ? (safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`)
          : safeName;
    const publicId = `${prefix}/${Date.now()}-${baseName}`;

    if (!this.configured) {
      this.fallback.set(publicId, { buffer, mimeType });
      return { fileKey: publicId, mimeType, sizeBytes: buffer.length };
    }

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          resource_type: resourceType,
          folder: this.folder,
          overwrite: false,
        },
        (error, uploaded) => {
          if (error || !uploaded) {
            reject(error ?? new Error('Cloudinary upload failed'));
            return;
          }
          resolve(uploaded);
        },
      );
      stream.end(buffer);
    });

    return {
      fileKey: result.public_id,
      mimeType,
      sizeBytes: result.bytes ?? buffer.length,
    };
  }
}

@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
