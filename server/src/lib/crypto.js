'use strict';

const crypto = require('crypto');
const env = require('../config/env');

const ALGORITHM = 'aes-256-gcm';
const PREFIX = 'enc:v1:';
const IV_BYTES = 12;

// Derived once at boot. The salt is fixed so the same DATA_ENCRYPTION_KEY
// always yields the same derived key across restarts and processes.
const key = crypto.scryptSync(env.dataEncryptionKey, 'qr-bite:field-encryption', 32);
const hmacKey = crypto.scryptSync(env.dataEncryptionKey, 'qr-bite:blind-index', 32);

/**
 * Encrypts a field value for storage at rest (Chapter 4.4 "Data Encryption").
 * Already-encrypted values pass through untouched so re-saving a loaded
 * document does not double-encrypt it.
 */
function encryptField(plain) {
  if (plain === null || plain === undefined || plain === '') return plain;
  const value = String(plain);
  if (value.startsWith(PREFIX)) return value;

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return PREFIX + [iv, tag, ciphertext].map((b) => b.toString('base64')).join(':');
}

/**
 * Decrypts a stored field. Values written before encryption was enabled (or
 * seeded by hand) are returned as-is rather than throwing, so a partially
 * migrated collection stays readable.
 */
function decryptField(stored) {
  if (stored === null || stored === undefined || stored === '') return stored;
  const value = String(stored);
  if (!value.startsWith(PREFIX)) return value;

  try {
    const [ivB64, tagB64, dataB64] = value.slice(PREFIX.length).split(':');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch (err) {
    return null;
  }
}

/**
 * Deterministic blind index. AES-GCM uses a random IV, so two encryptions of
 * the same phone number differ and cannot be queried by equality. We store
 * this HMAC alongside the ciphertext to look a customer up by phone.
 */
function blindIndex(value) {
  if (!value) return value;
  return crypto.createHmac('sha256', hmacKey).update(String(value)).digest('hex');
}

function randomCode(bytes = 6) {
  return crypto.randomBytes(bytes).toString('base64url');
}

module.exports = { encryptField, decryptField, blindIndex, randomCode };
