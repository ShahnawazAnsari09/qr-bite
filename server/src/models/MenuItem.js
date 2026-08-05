'use strict';

const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema(
  {
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    price: { type: Number, required: true, min: 0 },
    category: { type: String, required: true, trim: true, index: true },
    imageUrl: { type: String, default: '' },

    isVegetarian: { type: Boolean, default: true },
    spiceLevel: { type: String, enum: ['none', 'mild', 'medium', 'hot'], default: 'none' },
    preparationMinutes: { type: Number, default: 15, min: 0 },

    // Deactivated items disappear from the customer menu but are retained so
    // historical orders and ratings stay intact (Chapter 4.1, module 2 / RQ10).
    isActive: { type: Boolean, default: true, index: true },

    // Denormalised rating aggregate. Kept in sync incrementally on each new
    // rating so the menu never has to run an aggregation to render.
    ratingSum: { type: Number, default: 0, min: 0 },
    ratingCount: { type: Number, default: 0, min: 0 },
    avgRating: { type: Number, default: 0, min: 0, max: 5 },

    orderCount: { type: Number, default: 0, min: 0 },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

menuItemSchema.index({ restaurant: 1, category: 1, sortOrder: 1 });
menuItemSchema.index({ restaurant: 1, name: 1 });

/** Recomputes the cached average after ratingSum/ratingCount change. */
menuItemSchema.methods.refreshAverage = function refreshAverage() {
  this.avgRating = this.ratingCount > 0 ? Number((this.ratingSum / this.ratingCount).toFixed(2)) : 0;
  return this.avgRating;
};

module.exports = mongoose.model('MenuItem', menuItemSchema);
