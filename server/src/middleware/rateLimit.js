'use strict';

const rateLimit = require('express-rate-limit');
const env = require('../config/env');

// Rate limiting is disabled under test so the suite is not throttled by its
// own repetition.
const disabled = env.isTest;

function build(options) {
  if (disabled) return (_req, _res, next) => next();
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: options.message },
    ...options,
  });
}

/** Baseline protection for the whole API surface. */
const generalLimiter = build({
  windowMs: 60 * 1000,
  max: 240,
  message: 'Too many requests, please slow down.',
});

/** Brute-force protection on the staff login form. */
const loginLimiter = build({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: 'Too many login attempts. Try again in 15 minutes.',
});

/** A table cannot realistically place more than a handful of orders a minute. */
const orderLimiter = build({
  windowMs: 60 * 1000,
  max: 12,
  message: 'Too many orders from this device, please wait a moment.',
});

/** Stops a compromised dashboard session from burning the WhatsApp quota. */
const whatsappLimiter = build({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'WhatsApp send limit reached for this hour.',
});

/** Prevents a diner spamming the kitchen with waiter calls. */
const serviceRequestLimiter = build({
  windowMs: 5 * 60 * 1000,
  max: 6,
  message: 'A request was already sent. Please wait before calling again.',
});

module.exports = {
  generalLimiter,
  loginLimiter,
  orderLimiter,
  whatsappLimiter,
  serviceRequestLimiter,
};
