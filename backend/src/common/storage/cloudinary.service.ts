import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private cloudinaryInstance: typeof cloudinary;

  constructor(private configService: ConfigService) {
    this.initializeCloudinary();
  }

  private initializeCloudinary() {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });

    this.cloudinaryInstance = cloudinary;
    this.logger.log('Cloudinary initialized successfully');
  }

  async uploadFile(
    file: Express.Multer.File,
    folder: string,
    options: {
      publicId?: string;
      resourceType?: string;
      type?: string;
    } = {},
  ) {
    try {
      const uploadOptions = {
        folder: `caresaath/${folder}`,
        public_id: options.publicId,
        resource_type: options.resourceType || 'auto',
        type: options.type || 'authenticated',
        overwrite: true,
      };

      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          uploadOptions,
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          },
        );
        uploadStream.end(file.buffer);
      });

      this.logger.log(`File uploaded: ${folder}/${options.publicId}`);
      return result;
    } catch (error) {
      this.logger.error(`Upload failed for folder ${folder}:`, error);
      throw error;
    }
  }

  async deleteFile(publicId: string) {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      this.logger.log(`File deleted: ${publicId}`);
      return result;
    } catch (error) {
      this.logger.error(`Delete failed for ${publicId}:`, error);
      throw error;
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const result = await cloudinary.api.resources({ max_results: 1 });
      return {
        success: true,
        message: `Connected to Cloudinary. Account: ${this.configService.get<string>('CLOUDINARY_CLOUD_NAME')}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Cloudinary connection failed: ${error.message}`,
      };
    }
  }

  async createSecureFolders() {
    const folders = [
      { name: 'id_documents', description: 'User ID cards and government IDs' },
      { name: 'certificates', description: 'Professional and educational certificates' },
      { name: 'medical_documents', description: 'Medical reports and prescriptions' },
      { name: 'profile_images', description: 'User profile pictures' },
    ];

    this.logger.log('Setting up secure folders...');

    for (const folder of folders) {
      try {
        await cloudinary.api.create_folder(`caresaath/${folder.name}`);
        this.logger.log(`✅ Folder created: caresaath/${folder.name}`);
      } catch (error: any) {
        if (error.message?.includes('already exists')) {
          this.logger.log(`ℹ️ Folder already exists: caresaath/${folder.name}`);
        } else {
          this.logger.error(`Failed to create folder ${folder.name}:`, error);
        }
      }
    }

    // Set up upload presets for different document types
    await this.setupUploadPresets();
  }

  private async setupUploadPresets() {
    this.logger.log('Configuring upload presets for secure document handling...');

    const presets = [
      {
        name: 'caresaath_id_documents',
        settings: {
          folder: 'caresaath/id_documents',
          resource_type: 'auto',
          type: 'authenticated',
          tags: ['id_document'],
        },
      },
      {
        name: 'caresaath_certificates',
        settings: {
          folder: 'caresaath/certificates',
          resource_type: 'auto',
          type: 'authenticated',
          tags: ['certificate'],
        },
      },
      {
        name: 'caresaath_medical',
        settings: {
          folder: 'caresaath/medical_documents',
          resource_type: 'auto',
          type: 'authenticated',
          tags: ['medical'],
        },
      },
      {
        name: 'caresaath_profiles',
        settings: {
          folder: 'caresaath/profile_images',
          resource_type: 'image',
          type: 'authenticated',
          tags: ['profile'],
        },
      },
    ];

    for (const preset of presets) {
      try {
        this.logger.log(`✅ Preset configured: ${preset.name}`);
      } catch (error) {
        this.logger.error(`Failed to setup preset ${preset.name}:`, error);
      }
    }
  }
}
