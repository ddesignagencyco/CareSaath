import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

const testSMTP = async () => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: parseInt(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USERNAME,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  console.log('🔍 Testing SMTP Connection...\n');
  console.log(`Host: ${process.env.SMTP_HOST}`);
  console.log(`Port: ${process.env.SMTP_PORT}`);
  console.log(`Email: ${process.env.SMTP_USERNAME}\n`);

  try {
    // Verify connection
    await transporter.verify();
    console.log('✅ SMTP connection verified successfully!\n');

    // Send test email
    const info = await transporter.sendMail({
      from: `${process.env.SMTP_FROM_NAME} <${process.env.SMTP_FROM_EMAIL}>`,
      to: process.env.SMTP_USERNAME,
      subject: '✅ CareSaath SMTP Test Email',
      html: `
        <h1>🎉 SMTP Test Successful!</h1>
        <p>This is a test email from <strong>CareSaath</strong>.</p>
        <p>If you received this email, your SMTP configuration is working correctly!</p>
        <hr />
        <p><strong>Configuration Details:</strong></p>
        <ul>
          <li>Host: ${process.env.SMTP_HOST}</li>
          <li>Port: ${process.env.SMTP_PORT}</li>
          <li>From: ${process.env.SMTP_FROM_EMAIL}</li>
        </ul>
      `,
    });

    console.log('✅ Test email sent successfully!');
    console.log(`Message ID: ${info.messageId}\n`);
    console.log('📧 Check your inbox (or spam folder) for the test email!');
    process.exit(0);
  } catch (error) {
    console.error('❌ SMTP Error:', error.message);
    process.exit(1);
  }
};

testSMTP();
