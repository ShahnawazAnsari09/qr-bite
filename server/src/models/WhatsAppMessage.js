'use strict';

const mongoose = require('mongoose');

const MESSAGE_TYPE = Object.freeze({
  ORDER_CONFIRMATION: 'ORDER_CONFIRMATION',
  ORDER_SERVED: 'ORDER_SERVED',
  GREETING: 'GREETING',
  PROMOTION: 'PROMOTION',
});

const DELIVERY_STATUS = Object.freeze({
  QUEUED: 'QUEUED',
  SENT: 'SENT',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
});

/**
 * Audit trail of every WhatsApp message the platform attempts, so the admin can
 * see which customers a campaign actually reached (Chapter 4.1, module 8).
 */
const whatsAppMessageSchema = new mongoose.Schema(
  {
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },

    type: { type: String, enum: Object.values(MESSAGE_TYPE), required: true },
    content: { type: String, required: true, maxlength: 2000 },

    provider: { type: String, default: 'mock' },
    providerMessageId: { type: String, default: '' },
    deliveryStatus: {
      type: String,
      enum: Object.values(DELIVERY_STATUS),
      default: DELIVERY_STATUS.QUEUED,
      index: true,
    },
    error: { type: String, default: '' },

    // Only the masked form is stored here; the full number lives encrypted on
    // the Customer record.
    maskedPhone: { type: String, default: '' },
    sentAt: { type: Date },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffUser' },
    campaignId: { type: String, index: true },
  },
  { timestamps: true }
);

whatsAppMessageSchema.index({ restaurant: 1, createdAt: -1 });

const WhatsAppMessage = mongoose.model('WhatsAppMessage', whatsAppMessageSchema);

module.exports = WhatsAppMessage;
module.exports.MESSAGE_TYPE = MESSAGE_TYPE;
module.exports.DELIVERY_STATUS = DELIVERY_STATUS;
