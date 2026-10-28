import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const smtpServers = [
  {
    name: 'GoDaddy Secure Server (smtpout.secureserver.net) - Port 465',
    host: 'smtpout.secureserver.net',
    port: 465,
    secure: true,
  },
  {
    name: 'GoDaddy Secure Server (smtpout.secureserver.net) - Port 587',
    host: 'smtpout.secureserver.net',
    port: 587,
    secure: false,
  },
];

const testConfig = async (config) => {
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

const testAlternativeServers = async () => {
  console.log('🔍 Testing Alternative GoDaddy SMTP Servers...\n');
  console.log(`Email: ${process.env.SMTP_USERNAME}`);
  console.log(`Password: ${'*'.repeat(process.env.SMTP_PASSWORD.length)}\n`);

  const results = [];

  for (const config of smtpServers) {
    process.stdout.write(`⏳ Testing ${config.name}... `);
    const result = await testConfig(config);
    results.push(result);

    if (result.success) {
      console.log('✅ SUCCESS');
    } else {
      console.log(`❌ FAILED`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('TEST RESULTS');
  console.log('='.repeat(70) + '\n');

  const successful = results.filter((r) => r.success);

  if (successful.length > 0) {
    console.log('✅ WORKING CONFIGURATION FOUND!\n');
    const config = successful[0].config;
    console.log(`Server: ${config.name}`);
    console.log(`SMTP_HOST=${config.host}`);
    console.log(`SMTP_PORT=${config.port}\n`);

    // Send test email
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
        subject: '✅ CareSaath SMTP - Alternative Server Working',
        html: `<h1>✅ Alternative SMTP Server Working!</h1><p>Server: ${config.host}:${config.port}</p>`,
      });

      console.log('✅ Test email sent!');
      console.log(`Message ID: ${info.messageId}\n`);
      console.log(
        'Update your .env file with:\n',
      );
      console.log(`SMTP_HOST=${config.host}`);
      console.log(`SMTP_PORT=${config.port}\n`);
    } catch (error) {
      console.log('Error sending email:', error.message);
    }

    process.exit(0);
  } else {
    console.log('❌ No alternative servers are working\n');
    console.log('This suggests the issue is with authentication, not the server address.\n');
    console.log('IMPORTANT - Check in Titan Mail Dashboard:');
    console.log('1. Settings → Preferences');
    console.log(
      '2. Look for "Enable Titan on other apps" or "Configure 3rd party apps"',
    );
    console.log('3. Make sure it is TOGGLED ON\n');
    console.log('4. Verify you are using the correct mailbox password\n');
    process.exit(1);
  }
};

testAlternativeServers();
