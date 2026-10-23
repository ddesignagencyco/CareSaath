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

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];
const IMAGE_MIME_TYPES = ALLOWED_MIME_TYPES.filter((m) => m.startsWith('image/'));
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * File storage backed by Cloudinary (TRD §7). Images are uploaded as public
 * `image` resources and PDFs as public `raw` resources (public_id ends in
 * `.pdf`), referenced by their Cloudinary public_id (`fileKey`). `presignedGet`
 * returns the secure delivery URL; the resource type is derived from the key.
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
    const publicId = `${prefix}/${Date.now()}-${isPdf && !safeName.toLowerCase().endsWith('.pdf') ? `${safeName}.pdf` : safeName}`;

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

  /** Resource type a stored key was uploaded as: PDFs are raw, everything else image. */
  resourceTypeFor(fileKey: string): 'image' | 'raw' {
    return fileKey.toLowerCase().endsWith('.pdf') ? 'raw' : 'image';
  }

  /** Delivery URL for a stored file. Uploads are public, so no signature/expiry is needed. */
  async presignedGet(fileKey: string, ttlSeconds = 300): Promise<string> {
    if (!this.configured) {
      return `https://storage.local/${fileKey}?expires=${ttlSeconds}`;
    }
    return cloudinary.url(fileKey, {
      resource_type: this.resourceTypeFor(fileKey),
      type: 'upload',
      secure: true,
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
}

@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
