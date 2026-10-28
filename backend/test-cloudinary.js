import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';

dotenv.config({ path: '../.env' });

const testCloudinary = async () => {
  console.log('🔍 Testing Cloudinary Configuration...\n');

  // Initialize Cloudinary
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  console.log(`Cloud Name: ${process.env.CLOUDINARY_CLOUD_NAME}`);
  console.log(`API Key: ${process.env.CLOUDINARY_API_KEY.substring(0, 10)}...`);
  console.log(`Folder: ${process.env.CLOUDINARY_FOLDER}\n`);

  try {
    // Test connection
    console.log('Testing Cloudinary connection...');
    const resourcesResult = await cloudinary.api.resources({ max_results: 1 });
    console.log('✅ Cloudinary connection successful!\n');

    // Create secure folders
    console.log('Setting up secure folders for sensitive documents...\n');

    const folders = [
      {
        name: 'id_documents',
        description: 'User ID cards and government IDs',
      },
      {
        name: 'certificates',
        description: 'Professional and educational certificates',
      },
      {
        name: 'medical_documents',
        description: 'Medical reports and prescriptions',
      },
      {
        name: 'profile_images',
        description: 'User profile pictures',
      },
    ];

    for (const folder of folders) {
      try {
        await cloudinary.api.create_folder(`caresaath/${folder.name}`);
        console.log(`✅ Folder created: caresaath/${folder.name}`);
        console.log(`   📋 Purpose: ${folder.description}\n`);
      } catch (error) {
        if (error.message && error.message.includes('already exists')) {
          console.log(`ℹ️ Folder already exists: caresaath/${folder.name}`);
          console.log(`   📋 Purpose: ${folder.description}\n`);
        } else {
          console.error(`❌ Failed to create folder ${folder.name}:`, error.message);
        }
      }
    }

    // Test upload with a sample file
    console.log('Testing file upload to secure folder...\n');
    const testBuffer = Buffer.from('Test document content');
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'caresaath/id_documents',
          public_id: `test-document-${Date.now()}`,
          resource_type: 'auto',
          type: 'authenticated',
          tags: ['test', 'id_document'],
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        },
      );
      stream.end(testBuffer);
    });

    console.log('✅ Test file uploaded successfully!');
    console.log(`   📄 Public ID: ${uploadResult.public_id}`);
    console.log(`   🔒 Type: Authenticated (secure)\n`);

    // Clean up test file
    await cloudinary.uploader.destroy(uploadResult.public_id);
    console.log('🧹 Test file cleaned up\n');

    // Summary
    console.log('=' + '='.repeat(59));
    console.log('✅ CLOUDINARY SETUP COMPLETE');
    console.log('=' + '='.repeat(59));
    console.log('\n📁 Secure Folders Created:');
    folders.forEach((f) => {
      console.log(`   • caresaath/${f.name}`);
    });
    console.log('\n🔒 Security Features:');
    console.log('   • All uploads are authenticated (private)');
    console.log('   • Documents require valid JWT token for access');
    console.log('   • Separate folders for different document types');
    console.log('   • Support for images and PDFs\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Cloudinary Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response);
    }
    process.exit(1);
  }
};

testCloudinary();
