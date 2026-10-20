import {
  BadRequestException,
  Global,
  Injectable,
  Logger,
  Module,
  OnModuleInit,
} from '@nestjs/common';
import { Client } from 'minio';

export interface StoredFile {
  fileKey: string;
  mimeType: string;
  sizeBytes: number;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: Client;
  private readonly bucket: string;

  constructor() {
    this.bucket = process.env['MINIO_BUCKET'] ?? 'caresaath';
    this.client = new Client({
      endPoint: process.env['MINIO_ENDPOINT'] ?? 'localhost',
      port: Number(process.env['MINIO_PORT'] ?? 9000),
      useSSL: process.env['MINIO_USE_SSL'] === 'true',
      accessKey: process.env['MINIO_ACCESS_KEY'] ?? 'minioadmin',
      secretKey: process.env['MINIO_SECRET_KEY'] ?? 'minioadmin',
    });
  }

  async onModuleInit() {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket);
        this.logger.log(`Created bucket ${this.bucket}`);
      }
    } catch (err) {
      this.logger.error(`MinIO unavailable: ${(err as Error).message}`);
    }
  }

  async put(
    prefix: string,
    filename: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<StoredFile> {
    const fileKey = `${prefix}/${Date.now()}-${filename.replace(/[^\w.-]/g, '_')}`;
    await this.client.putObject(this.bucket, fileKey, buffer, buffer.length, {
      'Content-Type': mimeType,
    });
    return { fileKey, mimeType, sizeBytes: buffer.length };
  }

  async presignedGet(fileKey: string, ttlSeconds = 300): Promise<string> {
    return this.client.presignedGetObject(this.bucket, fileKey, ttlSeconds);
  }

  validateUpload(mimetype: string, size: number): void {
    const allowed = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
    ];
    if (!allowed.includes(mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, WEBP or PDF files are allowed');
    }
    if (size > 10 * 1024 * 1024) {
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
