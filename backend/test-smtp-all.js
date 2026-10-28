import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

// Common GoDaddy SMTP configurations
const smtpConfigs = [
  {
    name: 'GoDaddy Secure Server (Port 465)',
    host: 'smtp.secureserver.net',
    port: 465,
    secure: true,
  },
  {
    name: 'GoDaddy Secure Server (Port 587)',
    host: 'smtp.secureserver.net',
    port: 587,
    secure: false,
  },
  {
    name: 'GoDaddy Mail Servers (Port 465)',
    host: 'mailservers.godaddy.com',
    port: 465,
    secure: true,
  },
  {
    name: 'GoDaddy Mail Servers (Port 587)',
    host: 'mailservers.godaddy.com',
    port: 587,
    secure: false,
  },
  {
    name: 'GoDaddy Relay (Port 465)',
    host: 'relay.mailservers.godaddy.com',
    port: 465,
    secure: true,
  },
  {
    name: 'GoDaddy Relay (Port 587)',
    host: 'relay.mailservers.godaddy.com',
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
      // Timeout after 10 seconds
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

    // Force timeout if verify takes too long
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

const testAllConfigs = async () => {
  console.log('🔍 Testing GoDaddy SMTP Configurations...\n');
  console.log(`Email: ${process.env.SMTP_USERNAME}`);
  console.log(`Password: ${'*'.repeat(process.env.SMTP_PASSWORD.length)}\n`);
  console.log('Testing configurations:\n');

  const results = [];

  for (const config of smtpConfigs) {
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
    console.log('✅ WORKING CONFIGURATIONS:\n');
    successful.forEach((result) => {
      const config = result.config;
      console.log(`📧 ${config.name}`);
      console.log(`   Host: ${config.host}`);
      console.log(`   Port: ${config.port}`);
      console.log(`   Secure (TLS): ${!config.secure ? 'No (STARTTLS)' : 'Yes (SSL)'}\n`);
    });

    // Use the first working config
    const recommended = successful[0].config;
    console.log('=' + '='.repeat(69));
    console.log('✅ RECOMMENDED CONFIGURATION:\n');
    console.log(`SMTP_HOST=${recommended.host}`);
    console.log(`SMTP_PORT=${recommended.port}`);
    console.log(`SMTP_USERNAME=${process.env.SMTP_USERNAME}`);
    console.log(`SMTP_PASSWORD=${process.env.SMTP_PASSWORD}`);
    console.log(`SMTP_FROM_EMAIL=${process.env.SMTP_FROM_EMAIL}`);
    console.log(`SMTP_FROM_NAME=${process.env.SMTP_FROM_NAME}\n`);

    console.log('Update your .env file with the recommended configuration above.\n');

    // Test sending an email
    console.log('🚀 Testing email send...\n');
    const transporter = nodemailer.createTransport({
      host: recommended.host,
      port: recommended.port,
      secure: recommended.secure,
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
            <li>Host: ${recommended.host}</li>
            <li>Port: ${recommended.port}</li>
            <li>Email: ${process.env.SMTP_USERNAME}</li>
          </ul>
          <p>This email was sent successfully from CareSaath!</p>
        `,
      });

      console.log('✅ Test email sent successfully!');
      console.log(`   Message ID: ${info.messageId}\n`);
      console.log(
        '📧 Check your inbox (or spam folder) to verify the email was received.\n',
      );
    } catch (error) {
      console.error('❌ Failed to send test email:', error.message);
    }

    process.exit(0);
  } else {
    console.log('❌ NO WORKING CONFIGURATIONS FOUND\n');
    console.log('Failed attempts:');
    results.forEach((result) => {
      console.log(`   • ${result.config.name}: ${result.error}`);
    });
    console.log('\nTroubleshooting tips:');
    console.log('1. Verify email and password in .env are correct');
    console.log('2. Check that 2FA is not enabled on the email account');
    console.log('3. Check GoDaddy account for email access restrictions');
    console.log('4. Try generating an app-specific password if available\n');
    process.exit(1);
  }
};

testAllConfigs();
