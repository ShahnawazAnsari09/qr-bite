'use strict';

const env = require('../config/env');

/**
 * Normalises a user-typed phone number into E.164 digits (no leading '+').
 * Bare local numbers get the configured country code so that the same person
 * typing "9876543210" and "+91 98765 43210" resolves to one customer record.
 *
 * Returns null when the input cannot be a real number.
 */
function normalizePhone(input, countryCode = env.whatsapp.defaultCountryCode) {
  if (!input) return null;

  let digits = String(input).trim();
  const hadPlus = digits.startsWith('+');
  digits = digits.replace(/\D/g, '');

  if (!digits) return null;

  // 00-prefixed international dialling.
  if (!hadPlus && digits.startsWith('00')) digits = digits.slice(2);
  // Indian-style trunk prefix on a 10-digit local number.
  else if (!hadPlus && digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);

  if (!hadPlus && digits.length === 10) digits = `${countryCode}${digits}`;

  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

/** Masks a number for display in logs and non-privileged views. */
function maskPhone(phone) {
  if (!phone) return '';
  const digits = String(phone);
  if (digits.length <= 4) return '*'.repeat(digits.length);
  return `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}

module.exports = { normalizePhone, maskPhone };
