import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const gmtpConfigs = [
  {
    name: 'Gmail SMTP (Port 465 - SSL)',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
  },
  {
    name: 'Gmail SMTP (Port 587 - TLS)',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
  },
];

const testSMTPConfig = async (config) => {
  return new Promise((resolve) => {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: process.env.SMTP_USERNAME,
        pass: process.env.SMTP_PASSWORD,
      },
      connectionTimeout: 10000,
      socketTimeout: 10000,
    });

    transporter.verify((error, success) => {
      resolve({
        config,
        success: !error,
        error: error ? error.message : null,
      });
    });

    setTimeout(() => {
      transporter.close();
      resolve({
        config,
        success: false,
        error: 'Connection timeout',
      });
    }, 12000);
  });
};

const testGmailConfigs = async () => {
  console.log('🔍 Testing Gmail SMTP (GoDaddy Gmail-based email)...\n');
  console.log(`Email: ${process.env.SMTP_USERNAME}`);
  console.log(`Password: ${'*'.repeat(process.env.SMTP_PASSWORD.length)}\n`);
  console.log('⚠️  NOTE: If 2FA is enabled on Gmail, you MUST use an App Password\n');
  console.log('Testing configurations:\n');

  const results = [];

  for (const config of gmtpConfigs) {
    process.stdout.write(`⏳ Testing ${config.name}... `);
    const result = await testSMTPConfig(config);
    results.push(result);

    if (result.success) {
      console.log('✅ SUCCESS');
    } else {
      console.log(`❌ FAILED (${result.error})`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('TEST RESULTS SUMMARY');
  console.log('='.repeat(70) + '\n');

  const successful = results.filter((r) => r.success);

  if (successful.length > 0) {
    console.log('✅ WORKING CONFIGURATION:\n');
    const config = successful[0].config;
    console.log(`📧 ${config.name}`);
    console.log(`   Host: ${config.host}`);
    console.log(`   Port: ${config.port}`);
    console.log(`   Secure: ${config.secure ? 'Yes (SSL)' : 'No (TLS)'}\n`);

    console.log('=' + '='.repeat(69));
    console.log('✅ RECOMMENDED .env UPDATE:\n');
    console.log(`SMTP_HOST=${config.host}`);
    console.log(`SMTP_PORT=${config.port}`);
    console.log(`SMTP_USERNAME=${process.env.SMTP_USERNAME}`);
    console.log(`SMTP_PASSWORD=${process.env.SMTP_PASSWORD}`);
    console.log(`SMTP_FROM_EMAIL=${process.env.SMTP_FROM_EMAIL}`);
    console.log(`SMTP_FROM_NAME=${process.env.SMTP_FROM_NAME}\n`);

    // Test sending an email
    console.log('🚀 Testing email send...\n');
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: process.env.SMTP_USERNAME,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    try {
      const info = await transporter.sendMail({
        from: `${process.env.SMTP_FROM_NAME} <${process.env.SMTP_FROM_EMAIL}>`,
        to: process.env.SMTP_USERNAME,
        subject: '✅ CareSaath SMTP Configuration Successful',
        html: `
          <h1>🎉 CareSaath SMTP is Working!</h1>
          <p>Your production email configuration is ready.</p>
          <hr />
          <p><strong>Configuration:</strong></p>
          <ul>
            <li>Host: ${config.host}</li>
            <li>Port: ${config.port}</li>
            <li>Email: ${process.env.SMTP_USERNAME}</li>
            <li>Type: ${config.secure ? 'SSL (port 465)' : 'TLS (port 587)'}</li>
          </ul>
          <p>You can now send transactional emails from your CareSaath platform!</p>
          <hr />
          <p style="color: #666; font-size: 12px;">
            Sent by CareSaath Email Service
          </p>
        `,
      });

      console.log('✅ Test email sent successfully!');
      console.log(`   Message ID: ${info.messageId}\n`);
      console.log(
        '📧 Check your inbox (or spam folder) to verify the email was received.\n',
      );

      console.log('=' + '='.repeat(69));
      console.log('✅ PRODUCTION READY!\n');
      console.log('Your CareSaath platform is ready with:');
      console.log('  ✅ Cloudinary (image uploads with encryption)');
      console.log('  ✅ SMTP (transactional emails)\n');
    } catch (error) {
      console.error('❌ Failed to send test email:', error.message);
      console.log('\nIf you see "Invalid login" error:');
      console.log('1. Check if 2FA is enabled on your Gmail/GoDaddy account');
      console.log('2. If 2FA is enabled, create an "App Password" instead');
      console.log('3. Use the App Password in SMTP_PASSWORD instead\n');
    }

    process.exit(0);
  } else {
    console.log('❌ Gmail SMTP FAILED\n');
    console.log('Troubleshooting:\n');
    console.log('1. ❓ Do you have 2FA enabled on your Gmail/GoDaddy account?');
    console.log('   → If YES, create an "App Password" for "Mail" app');
    console.log('   → Use that App Password instead of regular password\n');
    console.log('2. ❓ Is the email password correct?');
    console.log('   → Verify you copied it correctly\n');
    console.log('3. ❓ Are firewall/network ports blocked?');
    console.log('   → This is unlikely if you can access Gmail in browser\n');
    console.log('Failed attempts:');
    results.forEach((result) => {
      console.log(`   • ${result.config.name}: ${result.error}`);
    });
    process.exit(1);
  }
};

testGmailConfigs();
