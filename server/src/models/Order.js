'use strict';

const mongoose = require('mongoose');

const ORDER_STATUS = Object.freeze({
  RECEIVED: 'RECEIVED',
  PREPARING: 'PREPARING',
  SERVED: 'SERVED',
  CANCELLED: 'CANCELLED',
});

/**
 * Staff move an order forward only (Chapter 4.3.2). Cancellation is the single
 * exception and is restricted to admins by the controller.
 */
const ALLOWED_TRANSITIONS = Object.freeze({
  [ORDER_STATUS.RECEIVED]: [ORDER_STATUS.PREPARING, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.PREPARING]: [ORDER_STATUS.SERVED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.SERVED]: [],
  [ORDER_STATUS.CANCELLED]: [],
});

/**
 * The report's ER model lists `order_items` as its own entity. In MongoDB it is
 * realised as an embedded array: an order item is never queried independently
 * of its order, and embedding keeps the whole ticket a single atomic read for
 * the live dashboard. Name and price are snapshotted so a later menu edit does
 * not rewrite the history of an order already served.
 */
const orderItemSchema = new mongoose.Schema(
  {
    menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1, max: 50 },
    lineTotal: { type: Number, required: true, min: 0 },
    note: { type: String, trim: true, maxlength: 200, default: '' },
  },
  { _id: true }
);

const orderSchema = new mongoose.Schema(
  {
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
    table: { type: mongoose.Schema.Types.ObjectId, ref: 'Table', required: true, index: true },
    // Denormalised so the dashboard can group table-wise without a join.
    tableNumber: { type: Number, required: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },

    orderNumber: { type: String, required: true, unique: true },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: [(v) => Array.isArray(v) && v.length > 0, 'An order must contain at least one item'],
    },

    subtotal: { type: Number, required: true, min: 0 },
    taxPercent: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },

    status: {
      type: String,
      enum: Object.values(ORDER_STATUS),
      default: ORDER_STATUS.RECEIVED,
      index: true,
    },
    statusHistory: [
      {
        status: { type: String, enum: Object.values(ORDER_STATUS), required: true },
        at: { type: Date, default: Date.now },
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffUser' },
        _id: false,
      },
    ],

    note: { type: String, trim: true, maxlength: 300, default: '' },
    servedAt: { type: Date },
    isRated: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Drives the live dashboard query: active orders for a restaurant, newest first.
orderSchema.index({ restaurant: 1, status: 1, createdAt: -1 });
orderSchema.index({ restaurant: 1, createdAt: -1 });

orderSchema.statics.ORDER_STATUS = ORDER_STATUS;
orderSchema.statics.ALLOWED_TRANSITIONS = ALLOWED_TRANSITIONS;

orderSchema.statics.canTransition = function canTransition(from, to) {
  return (ALLOWED_TRANSITIONS[from] || []).includes(to);
};

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
module.exports.ORDER_STATUS = ORDER_STATUS;
module.exports.ALLOWED_TRANSITIONS = ALLOWED_TRANSITIONS;
