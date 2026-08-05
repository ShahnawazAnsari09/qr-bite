'use strict';

const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema(
  {
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
    menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true, index: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },

    stars: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 500, default: '' },

    // Snapshotted so the public review list can show a first name without
    // decrypting a customer record on every menu render.
    customerFirstName: { type: String, default: 'Guest' },
  },
  { timestamps: true }
);

// One rating per dish per order: re-submitting updates rather than inflating
// the average (Chapter 4.1, module 6).
ratingSchema.index({ order: 1, menuItem: 1 }, { unique: true });
ratingSchema.index({ menuItem: 1, createdAt: -1 });

module.exports = mongoose.model('Rating', ratingSchema);
