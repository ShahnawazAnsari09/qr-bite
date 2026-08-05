'use strict';

const mongoose = require('mongoose');

const REQUEST_TYPE = Object.freeze({
  CALL_WAITER: 'CALL_WAITER',
  WATER: 'WATER',
  BILL: 'BILL',
});

/**
 * Backs the optional "Call Waiter" feature (RQ10 / TC8). Persisted rather than
 * fired purely over the socket so a request is not lost if the dashboard is
 * momentarily disconnected when the customer taps the button.
 */
const serviceRequestSchema = new mongoose.Schema(
  {
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
    table: { type: mongoose.Schema.Types.ObjectId, ref: 'Table', required: true },
    tableNumber: { type: Number, required: true },
    type: { type: String, enum: Object.values(REQUEST_TYPE), default: REQUEST_TYPE.CALL_WAITER },
    resolved: { type: Boolean, default: false, index: true },
    resolvedAt: { type: Date },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffUser' },
  },
  { timestamps: true }
);

serviceRequestSchema.index({ restaurant: 1, resolved: 1, createdAt: -1 });

const ServiceRequest = mongoose.model('ServiceRequest', serviceRequestSchema);

module.exports = ServiceRequest;
module.exports.REQUEST_TYPE = REQUEST_TYPE;
