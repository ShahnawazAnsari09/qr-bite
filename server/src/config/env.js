'use strict';

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const isTest = process.env.NODE_ENV === 'test';

/**
 * Reads a required variable. In tests we fall back to deterministic values so
 * the suite runs without a .env file; anywhere else a missing value is fatal
 * because silently booting with a default secret is worse than not booting.
 */
function required(name, testFallback) {
  const value = process.env[name];
  if (value) return value;
  if (isTest && testFallback !== undefined) return testFallback;
  throw new Error(
    `Missing required environment variable ${name}. Copy server/.env.example to server/.env and fill it in.`
  );
}

function list(name, fallback = '') {
  return (process.env[name] || fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Render injects the service's own public address, scheme included
 * (https://qr-bite.onrender.com). Reading it saves setting CLIENT_URL by hand
 * after the first deploy — which matters because table QR codes encode
 * CLIENT_URL, so a wrong value there means every printed code is wrong.
 * Empty off Render, and an explicit CLIENT_URL always wins.
 */
const renderUrl = process.env.RENDER_EXTERNAL_URL || '';

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest,
  port: Number(process.env.PORT || 5000),

  clientUrl: process.env.CLIENT_URL || renderUrl || 'http://localhost:5173',
  // The server also serves the built client, so its own origin is always
  // allowed — same-origin POSTs and the Socket.io handshake both carry it, and
  // omitting it would break the live order feed.
  corsOrigins: Array.from(
    new Set([
      ...list('CORS_ORIGINS', 'http://localhost:5173,http://localhost:4173'),
      ...(renderUrl ? [renderUrl] : []),
    ])
  ),

  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/qrbite',

  jwtSecret: required('JWT_SECRET', 'test-jwt-secret'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  customerTokenExpiresIn: process.env.CUSTOMER_TOKEN_EXPIRES_IN || '24h',

  dataEncryptionKey: required('DATA_ENCRYPTION_KEY', 'test-data-encryption-key-0123456789'),

  whatsapp: {
    provider: (process.env.WHATSAPP_PROVIDER || 'mock').toLowerCase(),
    defaultCountryCode: (process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '91').replace(/\D/g, ''),
    meta: {
      phoneNumberId: process.env.META_PHONE_NUMBER_ID || '',
      accessToken: process.env.META_ACCESS_TOKEN || '',
      apiVersion: process.env.META_API_VERSION || 'v20.0',
      templateOrderConfirmation: process.env.META_TEMPLATE_ORDER_CONFIRMATION || '',
      templatePromotion: process.env.META_TEMPLATE_PROMOTION || '',
      templateLanguage: process.env.META_TEMPLATE_LANGUAGE || 'en',
    },
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN || '',
      from: process.env.TWILIO_WHATSAPP_FROM || '',
    },
    richautomate: {
  apiKey: process.env.RICHAUTOMATE_API_KEY || '',
  baseUrl: process.env.RICHAUTOMATE_BASE_URL || 'https://richautomate.in/api/v1',
  templateOrderConfirmation:
    process.env.RICHAUTOMATE_TEMPLATE_ORDER_CONFIRMATION || '',
  templateLanguage: process.env.RICHAUTOMATE_TEMPLATE_LANGUAGE || 'en_US',
},
  },

  seed: {
    adminUsername: process.env.SEED_ADMIN_USERNAME || 'admin',
    adminPassword: process.env.SEED_ADMIN_PASSWORD || 'Admin@123',
    staffUsername: process.env.SEED_STAFF_USERNAME || 'staff01',
    staffPassword: process.env.SEED_STAFF_PASSWORD || 'Staff@123',
    restaurantName: process.env.SEED_RESTAURANT_NAME || 'QR-Bite Demo Restaurant',
    tableCount: Number(process.env.SEED_TABLE_COUNT || 8),
  },
};

module.exports = env;
