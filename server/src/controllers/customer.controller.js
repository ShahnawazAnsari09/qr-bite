'use strict';

/**
 * The customer database that accumulates from orders, plus the WhatsApp
 * outreach built on top of it (Chapter 4.1, modules 7 and 8).
 */

const crypto = require('crypto');

const ApiError = require('../lib/ApiError');
const asyncHandler = require('../lib/asyncHandler');
const { blindIndex } = require('../lib/crypto');
const { maskPhone, normalizePhone } = require('../lib/phone');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const Restaurant = require('../models/Restaurant');
const { ROLES } = require('../models/StaffUser');
const WhatsAppMessage = require('../models/WhatsAppMessage');
const { MESSAGE_TYPE, DELIVERY_STATUS } = require('../models/WhatsAppMessage');
const whatsapp = require('../services/whatsapp');

const SORTS = {
  recent: { lastOrderAt: -1, createdAt: -1 },
  spend: { totalSpend: -1 },
  orders: { orderCount: -1 },
};

function serializeCustomer(customer) {
  return {
    id: customer._id,
    name: customer.name,
    phone: customer.phone,
    maskedPhone: maskPhone(customer.phone),
    visitCount: customer.visitCount,
    orderCount: customer.orderCount,
    totalSpend: customer.totalSpend,
    lastOrderAt: customer.lastOrderAt,
    marketingOptIn: customer.marketingOptIn,
    lastMessagedAt: customer.lastMessagedAt,
    createdAt: customer.createdAt,
  };
}

/**
 * RQ9 — the customer list.
 *
 * Names and phone numbers are encrypted at rest, so the database cannot match
 * on them. A numeric search is resolved through the phone blind index (an exact
 * lookup); a text search decrypts the restaurant's customers and filters in
 * memory. That is acceptable at single-restaurant scale and is the price of
 * storing personal data encrypted.
 */
const list = asyncHandler(async (req, res) => {
  const { page, limit, search, sort } = req.query;
  const sortSpec = SORTS[sort] || SORTS.recent;

  if (search && /^[+0-9\s()-]+$/.test(search)) {
    const normalized = normalizePhone(search);
    const customer = normalized
      ? await Customer.findOne({ restaurant: req.restaurantId, phoneHash: blindIndex(normalized) })
      : null;

    return res.json({
      success: true,
      data: customer ? [serializeCustomer(customer)] : [],
      meta: { page: 1, limit, total: customer ? 1 : 0, pages: 1 },
    });
  }

  if (search) {
    const all = await Customer.find({ restaurant: req.restaurantId }).sort(sortSpec);
    const needle = search.toLowerCase();
    const matched = all.filter((c) => String(c.name || '').toLowerCase().includes(needle));
    const start = (page - 1) * limit;

    return res.json({
      success: true,
      data: matched.slice(start, start + limit).map(serializeCustomer),
      meta: {
        page,
        limit,
        total: matched.length,
        pages: Math.max(1, Math.ceil(matched.length / limit)),
      },
    });
  }

  const [customers, total] = await Promise.all([
    Customer.find({ restaurant: req.restaurantId })
      .sort(sortSpec)
      .skip((page - 1) * limit)
      .limit(limit),
    Customer.countDocuments({ restaurant: req.restaurantId }),
  ]);

  return res.json({
    success: true,
    data: customers.map(serializeCustomer),
    meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

/** One customer with their order history — the "regular or first-timer?" view. */
const getOne = asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ _id: req.params.id, restaurant: req.restaurantId });
  if (!customer) throw ApiError.notFound('Customer not found');

  const [orders, messages] = await Promise.all([
    Order.find({ customer: customer._id }).sort({ createdAt: -1 }).limit(20),
    WhatsAppMessage.find({ customer: customer._id }).sort({ createdAt: -1 }).limit(20),
  ]);

  res.json({
    success: true,
    data: {
      customer: serializeCustomer(customer),
      orders: orders.map((o) => ({
        id: o._id,
        orderNumber: o.orderNumber,
        tableNumber: o.tableNumber,
        status: o.status,
        totalAmount: o.totalAmount,
        itemCount: o.items.length,
        createdAt: o.createdAt,
      })),
      messages: messages.map((m) => ({
        id: m._id,
        type: m.type,
        content: m.content,
        deliveryStatus: m.deliveryStatus,
        createdAt: m.createdAt,
      })),
    },
  });
});

/**
 * Marketing consent toggle. Opting out is honoured by the broadcast endpoint
 * even when the customer is explicitly selected, so an accidental "select all"
 * cannot message someone who asked not to be contacted.
 */
const toggleOptIn = asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ _id: req.params.id, restaurant: req.restaurantId });
  if (!customer) throw ApiError.notFound('Customer not found');

  customer.marketingOptIn = !customer.marketingOptIn;
  await customer.save();

  res.json({ success: true, data: serializeCustomer(customer) });
});

/**
 * UC12 / TC13 — the WhatsApp broadcast. Admin-only, rate limited, and reports a
 * per-message outcome so the admin can see who the campaign actually reached.
 */
const broadcast = asyncHandler(async (req, res) => {
  const { body, type, customerIds, allCustomers } = req.body;

  const filter = { restaurant: req.restaurantId, marketingOptIn: true };
  if (!allCustomers) filter._id = { $in: customerIds };

  const customers = await Customer.find(filter);
  if (customers.length === 0) {
    throw ApiError.badRequest(
      'No opted-in customers matched that selection, so nothing was sent.'
    );
  }

  const restaurant = await Restaurant.findById(req.restaurantId);
  const campaignId = crypto.randomUUID();

  const results = await whatsapp.sendCampaign({
    restaurant,
    customers,
    body,
    type: type === 'GREETING' ? MESSAGE_TYPE.GREETING : MESSAGE_TYPE.PROMOTION,
    sentBy: req.staff._id,
    campaignId,
  });

  const sentAt = new Date();
  await Customer.updateMany(
    { _id: { $in: customers.map((c) => c._id) } },
    { $set: { lastMessagedAt: sentAt } }
  );

  const tally = (status) => results.filter((r) => r.deliveryStatus === status).length;

  res.status(201).json({
    success: true,
    message: `Campaign sent to ${tally(DELIVERY_STATUS.SENT)} of ${results.length} customer(s).`,
    data: {
      campaignId,
      provider: whatsapp.getProvider().name,
      total: results.length,
      sent: tally(DELIVERY_STATUS.SENT),
      failed: tally(DELIVERY_STATUS.FAILED),
      skipped: tally(DELIVERY_STATUS.SKIPPED),
      results: results.map((r) => ({
        id: r._id,
        maskedPhone: r.maskedPhone,
        deliveryStatus: r.deliveryStatus,
        error: r.error,
      })),
    },
  });
});

/** Audit trail of every message the platform has attempted. */
const messageLog = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;

  const [messages, total] = await Promise.all([
    WhatsAppMessage.find({ restaurant: req.restaurantId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('customer', 'name'),
    WhatsAppMessage.countDocuments({ restaurant: req.restaurantId }),
  ]);

  res.json({
    success: true,
    data: messages.map((m) => ({
      id: m._id,
      customerName: m.customer ? m.customer.name : 'Deleted customer',
      maskedPhone: m.maskedPhone,
      type: m.type,
      content: m.content,
      provider: m.provider,
      deliveryStatus: m.deliveryStatus,
      error: m.error,
      createdAt: m.createdAt,
    })),
    meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

module.exports = { list, getOne, toggleOptIn, broadcast, messageLog, ROLES };
