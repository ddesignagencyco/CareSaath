import fs from 'node:fs';
import path from 'node:path';

// Helper to load .env without any external dependency
function loadEnv() {
  const envPaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
    path.resolve(process.cwd(), 'backend/.env'),
  ];
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      try {
        const lines = fs.readFileSync(envPath, 'utf8').split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const idx = trimmed.indexOf('=');
          if (idx !== -1) {
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      } catch { }
    }
  }
}

loadEnv();

/**
 * Pure Node.js zero-dependency test runner for Meta WhatsApp Cloud API
 *
 * Usage:
 *   node backend/test-whatsapp-otp.mjs [OTP_CODE]
 * Examples:
 *   node backend/test-whatsapp-otp.mjs            # sends default test template
 *   node backend/test-whatsapp-otp.mjs 582910      # sends OTP code
 */

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '1458147487380503';
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const TO_PHONE = process.env.WHATSAPP_TEST_RECIPIENT;
const TEMPLATE_NAME = process.env.WHATSAPP_OTP_TEMPLATE || 'hello_world';
const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';

// Optional OTP code from CLI args
const OTP_CODE = process.argv[2] && !process.argv[2].startsWith('EAA') ? process.argv[2] : '123456';

console.log('==============================================');
console.log('🚀 Meta WhatsApp Cloud API - OTP Runner');
console.log('==============================================\n');

if (!ACCESS_TOKEN) {
  console.log('❌ ACCESS_TOKEN nahi mila! .env file check karein.');
  process.exit(1);
}

if (!TO_PHONE) {
  console.log('❌ WHATSAPP_TEST_RECIPIENT nahi mila! .env file check karein.');
  process.exit(1);
}

const cleanPhone = TO_PHONE.replace(/[^0-9]/g, '');
const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;

let payload;

if (TEMPLATE_NAME === 'hello_world') {
  console.log(`ℹ️ Template: hello_world (Pre-approved test template)`);
  payload = {
    messaging_product: 'whatsapp',
    to: cleanPhone,
    type: 'template',
    template: {
      name: 'hello_world',
      language: {
        code: 'en_US',
      },
    },
  };
} else {
  console.log(`ℹ️ Template: ${TEMPLATE_NAME} with OTP Code: ${OTP_CODE}`);
  payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanPhone,
    type: 'template',
    template: {
      name: TEMPLATE_NAME,
      language: { code: 'en_US' },
      components: [
        {
          type: 'body',
          parameters: [{ type: 'text', text: OTP_CODE }],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: OTP_CODE }],
        },
      ],
    },
  };
}

console.log(`📡 Sender Phone Number ID: ${PHONE_NUMBER_ID}`);
console.log(`📤 Recipient Phone:        +${cleanPhone}`);
console.log(`🌐 Endpoint:                ${url}`);
console.log('\n⏳ WhatsApp message send ho raha hai...');

try {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (response.ok) {
    console.log('\n🎉 SUCCESS! Message bhej diya gaya hai.');
    console.log('Meta API Response:\n', JSON.stringify(data, null, 2));
    console.log('\n👉 Apne mobile WhatsApp par message check karein!');
  } else {
    console.log(`\n❌ Error (Status: ${response.status}):\n`);
    console.log(JSON.stringify(data, null, 2));

    if (data?.error?.code === 190) {
      console.log('\n💡 Zaroori: Access Token expire ho chuka hai (24 hours pure ho gaye).');
      console.log('Naya token generate karein ya Permanent System User Token banayein.');
    } else if (data?.error?.code === 132001) {
      console.log(`\n💡 Template '${TEMPLATE_NAME}' Meta par nahi mila ya abhi Approve nahi hua.`);
      console.log('Meta Business Manager > Message Templates mein ja kar check karein.');
    }
  }
} catch (err) {
  console.error('\n❌ Network error:', err.message);
}
