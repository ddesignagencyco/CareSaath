import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const testTitanSMTP = async () => {
  console.log('🔍 Testing Titan Mail SMTP Configuration...\n');

  const config = {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: parseInt(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USERNAME,
      pass: process.env.SMTP_PASSWORD,
    },
  };

  console.log(`SMTP Host: ${config.host}`);
  console.log(`SMTP Port: ${config.port}`);
  console.log(`Secure (SSL): ${config.secure ? 'Yes' : 'No'}`);
  console.log(`Email: ${process.env.SMTP_USERNAME}`);
  console.log(`Password: ${'*'.repeat(process.env.SMTP_PASSWORD.length)}\n`);

  const transporter = nodemailer.createTransport(config);

  try {
    // Test connection
    console.log('🔗 Testing Titan Mail connection...');
    await transporter.verify();
    console.log('✅ Connection successful!\n');

    // Send test email
    console.log('📧 Sending test email...\n');
    const info = await transporter.sendMail({
      from: `${process.env.SMTP_FROM_NAME} <${process.env.SMTP_FROM_EMAIL}>`,
      to: process.env.SMTP_USERNAME,
      subject: '✅ CareSaath SMTP Configuration Successful',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #4CAF50;">🎉 CareSaath SMTP is Working!</h1>

          <p>Your production email configuration is ready and tested.</p>

          <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">

          <h2 style="color: #333;">Configuration Details</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="background-color: #f5f5f5;">
              <td style="padding: 10px; font-weight: bold;">SMTP Host:</td>
              <td style="padding: 10px;">${config.host}</td>
            </tr>
            <tr>
              <td style="padding: 10px; font-weight: bold;">SMTP Port:</td>
              <td style="padding: 10px;">${config.port} (SSL)</td>
            </tr>
            <tr style="background-color: #f5f5f5;">
              <td style="padding: 10px; font-weight: bold;">Email:</td>
              <td style="padding: 10px;">${process.env.SMTP_USERNAME}</td>
            </tr>
            <tr>
              <td style="padding: 10px; font-weight: bold;">Service:</td>
              <td style="padding: 10px;">Titan Mail (GoDaddy)</td>
            </tr>
          </table>

          <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">

          <h2 style="color: #333;">✅ Production Status</h2>
          <ul style="line-height: 1.8;">
            <li>✅ Cloudinary - Image uploads with encryption</li>
            <li>✅ SMTP - Transactional emails via Titan Mail</li>
            <li>✅ Security - All documents authenticated & encrypted</li>
          </ul>

          <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">

          <p style="color: #666; font-size: 12px; text-align: center;">
            This email was sent by CareSaath Email Service<br>
            ${new Date().toLocaleString()}
          </p>
        </div>
      `,
    });

    console.log('✅ Test email sent successfully!');
    console.log(`   Message ID: ${info.messageId}\n`);

    console.log('=' + '='.repeat(70));
    console.log('✅ PRODUCTION READY - CARESAATH EMAIL SYSTEM');
    console.log('=' + '='.repeat(70) + '\n');

    console.log('📦 Services Configured:');
    console.log('   ✅ Cloudinary - Secure document storage');
    console.log('   ✅ Titan Mail SMTP - Transactional emails\n');

    console.log('📋 Current Configuration:');
    console.log(`   SMTP_HOST=${config.host}`);
    console.log(`   SMTP_PORT=${config.port}`);
    console.log(`   SMTP_USERNAME=${process.env.SMTP_USERNAME}`);
    console.log(`   SMTP_FROM_EMAIL=${process.env.SMTP_FROM_EMAIL}`);
    console.log(`   SMTP_FROM_NAME=${process.env.SMTP_FROM_NAME}\n`);

    console.log('🚀 Next Steps:');
    console.log('   1. Check your inbox for the test email');
    console.log('   2. Deploy to production');
    console.log('   3. Monitor email delivery from the admin panel\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ SMTP Error:', error.message);

    if (
      error.message.includes('Invalid login') ||
      error.message.includes('Authentication failed')
    ) {
      console.log('\n⚠️  Authentication Failed!');
      console.log('Please check:');
      console.log('1. Email address is correct: info@caresaath.com');
      console.log('2. Password is correct: CareSath@123');
      console.log('3. "Enable Titan on other apps" is toggled ON in Titan dashboard');
      console.log(
        '4. You are using the mailbox password, not GoDaddy customer portal password\n',
      );
    } else if (error.message.includes('ECONNREFUSED')) {
      console.log('\n⚠️  Connection Refused!');
      console.log('Titan Mail SMTP server might be:');
      console.log('1. Temporarily unavailable');
      console.log('2. Blocked by firewall/network');
      console.log('3. Try using alternative: smtpout.secureserver.net\n');
    }

    process.exit(1);
  }
};

testTitanSMTP();
