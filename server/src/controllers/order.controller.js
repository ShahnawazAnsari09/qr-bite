'use strict';

/**
 * Staff-facing order handling: the live kitchen monitor, order history, status
 * changes, and the waiter-call queue.
 */

const ApiError = require('../lib/ApiError');
const asyncHandler = require('../lib/asyncHandler');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const { ORDER_STATUS } = require('../models/Order');
const Restaurant = require('../models/Restaurant');
const ServiceRequest = require('../models/ServiceRequest');
const { ROLES } = require('../models/StaffUser');
const orderService = require('../services/order.service');
const whatsapp = require('../services/whatsapp');
const { emitToRestaurant, emitToOrder, EVENTS } = require('../realtime/io');

const ACTIVE_STATUSES = [ORDER_STATUS.RECEIVED, ORDER_STATUS.PREPARING];

/**
 * RQ5 / UC4 — the live monitor. Returns only orders still in the kitchen,
 * grouped by table so the dashboard mirrors the floor plan.
 */
const live = asyncHandler(async (req, res) => {
  const orders = await Order.find({
    restaurant: req.restaurantId,
    status: { $in: ACTIVE_STATUSES },
  })
    .sort({ createdAt: 1 })
    .populate('customer', 'name phone');

  const serialized = orders.map((order) => orderService.serializeOrder(order));

  const byTable = new Map();
  for (const order of serialized) {
    if (!byTable.has(order.tableNumber)) byTable.set(order.tableNumber, []);
    byTable.get(order.tableNumber).push(order);
  }

  const tables = [...byTable.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tableNumber, tableOrders]) => ({
      tableNumber,
      orders: tableOrders,
      openTotal: orderService.round2(
        tableOrders.reduce((sum, o) => sum + o.totalAmount, 0)
      ),
    }));

  const pendingRequests = await ServiceRequest.find({
    restaurant: req.restaurantId,
    resolved: false,
  })
    .sort({ createdAt: 1 })
    .limit(50);

  res.json({
    success: true,
    data: {
      orders: serialized,
      tables,
      counts: {
        received: serialized.filter((o) => o.status === ORDER_STATUS.RECEIVED).length,
        preparing: serialized.filter((o) => o.status === ORDER_STATUS.PREPARING).length,
        total: serialized.length,
      },
      serviceRequests: pendingRequests.map((r) => ({
        id: r._id,
        tableNumber: r.tableNumber,
        type: r.type,
        createdAt: r.createdAt,
      })),
    },
  });
});

/** Paginated history with the filters the reports screen needs. */
const list = asyncHandler(async (req, res) => {
  const { page, limit, status, tableNumber, from, to } = req.query;

  const filter = { restaurant: req.restaurantId };
  if (status === 'ACTIVE') filter.status = { $in: ACTIVE_STATUSES };
  else if (status !== 'ALL') filter.status = status;
  if (tableNumber) filter.tableNumber = tableNumber;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('customer', 'name phone'),
    Order.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: orders.map((order) => orderService.serializeOrder(order)),
    meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

const getOne = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, restaurant: req.restaurantId }).populate(
    'customer',
    'name phone visitCount orderCount totalSpend'
  );
  if (!order) throw ApiError.notFound('Order not found');

  res.json({ success: true, data: orderService.serializeOrder(order) });
});

/**
 * UC4 / TC12 — advance an order through the kitchen lifecycle. Cancellation is
 * admin-only: any staff member can cook and serve, but voiding a ticket affects
 * the day's revenue figures.
 */
const updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  if (status === ORDER_STATUS.CANCELLED && req.staff.role !== ROLES.ADMIN) {
    throw ApiError.forbidden('Only an admin can cancel an order');
  }

  const order = await Order.findOne({ _id: req.params.id, restaurant: req.restaurantId });
  if (!order) throw ApiError.notFound('Order not found');

  await orderService.transitionStatus({ order, nextStatus: status, staffId: req.staff._id });

  const customer = await Customer.findById(order.customer);
  const serialized = orderService.serializeOrder(order, customer);

  // The dashboard updates every connected monitor; the customer's phone gets
  // the same change pushed to its own private room (RQ5 / TC6).
  emitToRestaurant(req.restaurantId, EVENTS.ORDER_UPDATED, serialized);
  emitToOrder(order._id, EVENTS.ORDER_UPDATED, serialized);

  // A "your food is on the way" note doubles as the prompt to leave a rating.
  if (status === ORDER_STATUS.SERVED && customer) {
    const restaurant = await Restaurant.findById(req.restaurantId);
    await whatsapp.sendOrderServed({ restaurant, customer, order });
  }

  res.json({ success: true, message: `Order marked ${status}`, data: serialized });
});

/** Clears a waiter call once someone has attended the table. */
const resolveServiceRequest = asyncHandler(async (req, res) => {
  const request = await ServiceRequest.findOne({
    _id: req.params.id,
    restaurant: req.restaurantId,
  });
  if (!request) throw ApiError.notFound('Service request not found');

  request.resolved = true;
  request.resolvedAt = new Date();
  request.resolvedBy = req.staff._id;
  await request.save();

  emitToRestaurant(req.restaurantId, EVENTS.SERVICE_RESOLVED, { id: String(request._id) });

  res.json({ success: true, message: 'Request cleared', data: { id: request._id } });
});

const listServiceRequests = asyncHandler(async (req, res) => {
  const requests = await ServiceRequest.find({ restaurant: req.restaurantId })
    .sort({ resolved: 1, createdAt: -1 })
    .limit(100);

  res.json({ success: true, data: requests });
});

module.exports = {
  live,
  list,
  getOne,
  updateStatus,
  resolveServiceRequest,
  listServiceRequests,
};
