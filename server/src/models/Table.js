'use strict';

const mongoose = require('mongoose');
const { randomCode } = require('../lib/crypto');

const tableSchema = new mongoose.Schema(
  {
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
    tableNumber: { type: Number, required: true, min: 1 },
    label: { type: String, trim: true, default: '' },
    seats: { type: Number, default: 4, min: 1 },

    // Random, unguessable slug embedded in the QR code URL. Sequential table
    // numbers in the URL would let anyone order against any table by editing
    // the address bar, so the public identifier is decoupled from the number.
    code: { type: String, required: true, unique: true, default: () => randomCode(6) },

    // Cached data-URL of the rendered QR image (Chapter 4.1, module 1).
    qrCodeUrl: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

tableSchema.index({ restaurant: 1, tableNumber: 1 }, { unique: true });

tableSchema.virtual('displayName').get(function displayName() {
  return this.label || `Table ${this.tableNumber}`;
});

tableSchema.set('toJSON', { virtuals: true });
tableSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Table', tableSchema);
