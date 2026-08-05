'use strict';

const mongoose = require('mongoose');
const { encryptField, decryptField } = require('../lib/crypto');

/**
 * Customer records are built implicitly from orders — a diner never registers.
 * Name and phone are the only personal data the platform holds, and both are
 * encrypted at rest; `phoneHash` is the deterministic blind index used for
 * lookup, since the ciphertext itself is not searchable.
 */
const customerSchema = new mongoose.Schema(
  {
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },

    name: {
      type: String,
      required: true,
      set: encryptField,
      get: decryptField,
    },
    phone: {
      type: String,
      required: true,
      set: encryptField,
      get: decryptField,
    },
    phoneHash: { type: String, required: true, index: true },

    visitCount: { type: Number, default: 0, min: 0 },
    orderCount: { type: Number, default: 0, min: 0 },
    totalSpend: { type: Number, default: 0, min: 0 },
    lastOrderAt: { type: Date },

    // Set false when a customer asks not to be contacted; the broadcast
    // endpoint skips these records.
    marketingOptIn: { type: Boolean, default: true },
    lastMessagedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  }
);

customerSchema.index({ restaurant: 1, phoneHash: 1 }, { unique: true });

module.exports = mongoose.model('Customer', customerSchema);
