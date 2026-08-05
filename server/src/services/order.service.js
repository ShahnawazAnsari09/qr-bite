'use strict';

const ApiError = require('../lib/ApiError');
const { blindIndex } = require('../lib/crypto');
const { normalizePhone } = require('../lib/phone');
const Counter = require('../models/Counter');
const Customer = require('../models/Customer');
const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');
const { ORDER_STATUS } = require('../models/Order');

/** Human-readable ticket number, unique per restaurant. */
async function nextOrderNumber(restaurantId) {
  const seq = await Counter.next(`order:${restaurantId}`, 1000);
  return `ORD${seq}`;
}

/** Currency-safe rounding — avoids 1234.5600000000002 creeping into totals. */
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Finds or creates the customer behind an order. The same phone number always
 * resolves to one record, which is what turns a stream of orders into the
 * running customer database of Chapter 4.1, module 7.
 */
async function upsertCustomer({ restaurantId, name, phone }) {
  const normalized = normalizePhone(phone);
  if (!normalized) throw ApiError.badRequest('Please enter a valid phone number');

  const phoneHash = blindIndex(normalized);
  let customer = await Customer.findOne({ restaurant: restaurantId, phoneHash });

  if (customer) {
    // Trust the most recent spelling the diner gave us.
    customer.name = name;
    customer.visitCount += 1;
    return customer;
  }

  customer = new Customer({
    restaurant: restaurantId,
    name,
    phone: normalized,
    phoneHash,
    visitCount: 1,
  });

  return customer;
}

/**
 * Prices the cart from the database rather than trusting the client. A browser
 * can post any price it likes; only the stored menu price is authoritative.
 * Also rejects deactivated items, which is what makes RQ10 (mark out of stock)
 * actually prevent orders.
 */
async function priceCart({ restaurantId, items, taxPercent }) {
  const ids = items.map((i) => i.menuItemId);
  const menuItems = await MenuItem.find({
    _id: { $in: ids },
    restaurant: restaurantId,
  });

  const byId = new Map(menuItems.map((m) => [String(m._id), m]));
  const orderItems = [];

  for (const line of items) {
    const menuItem = byId.get(String(line.menuItemId));
    if (!menuItem) throw ApiError.badRequest('One of the selected dishes is no longer on the menu');
    if (!menuItem.isActive) throw ApiError.conflict(`"${menuItem.name}" is currently unavailable`);

    const lineTotal = round2(menuItem.price * line.quantity);
    orderItems.push({
      menuItem: menuItem._id,
      name: menuItem.name,
      price: menuItem.price,
      quantity: line.quantity,
      lineTotal,
      note: line.note || '',
    });
  }

  const subtotal = round2(orderItems.reduce((sum, i) => sum + i.lineTotal, 0));
  const taxAmount = round2((subtotal * (taxPercent || 0)) / 100);
  const totalAmount = round2(subtotal + taxAmount);

  return { orderItems, subtotal, taxAmount, totalAmount };
}

/**
 * Creates the order and the customer record together (UC3 normal course,
 * steps 3-4). WhatsApp confirmation and the socket broadcast are triggered by
 * the controller so this stays a pure persistence step.
 */
async function createOrder({ restaurant, table, customerInput, items, note = '' }) {
  const { orderItems, subtotal, taxAmount, totalAmount } = await priceCart({
    restaurantId: restaurant._id,
    items,
    taxPercent: restaurant.taxPercent,
  });

  const customer = await upsertCustomer({
    restaurantId: restaurant._id,
    name: customerInput.name,
    phone: customerInput.phone,
  });

  customer.orderCount += 1;
  customer.totalSpend = round2(customer.totalSpend + totalAmount);
  customer.lastOrderAt = new Date();
  await customer.save();

  const order = await Order.create({
    restaurant: restaurant._id,
    table: table._id,
    tableNumber: table.tableNumber,
    customer: customer._id,
    orderNumber: await nextOrderNumber(restaurant._id),
    items: orderItems,
    subtotal,
    taxPercent: restaurant.taxPercent,
    taxAmount,
    totalAmount,
    note,
    status: ORDER_STATUS.RECEIVED,
    statusHistory: [{ status: ORDER_STATUS.RECEIVED, at: new Date() }],
  });

  // Popularity counter powering the "best sellers" report.
  await MenuItem.bulkWrite(
    orderItems.map((item) => ({
      updateOne: {
        filter: { _id: item.menuItem },
        update: { $inc: { orderCount: item.quantity } },
      },
    }))
  );

  return { order, customer };
}

/**
 * Applies a status change, enforcing the forward-only lifecycle from the state
 * diagram in Chapter 4.3.2.
 */
async function transitionStatus({ order, nextStatus, staffId }) {
  if (order.status === nextStatus) return order;

  if (!Order.canTransition(order.status, nextStatus)) {
    throw ApiError.conflict(
      `Cannot move an order from ${order.status} to ${nextStatus}. Orders only move forward.`
    );
  }

  order.status = nextStatus;
  order.statusHistory.push({ status: nextStatus, at: new Date(), by: staffId });
  if (nextStatus === ORDER_STATUS.SERVED) order.servedAt = new Date();

  await order.save();
  return order;
}

/** Shape sent to the dashboard and the customer tracking page. */
function serializeOrder(order, customer = null) {
  const plain = typeof order.toObject === 'function' ? order.toObject() : order;
  const linkedCustomer = customer || (plain.customer && plain.customer.name ? plain.customer : null);

  return {
    id: String(plain._id),
    orderNumber: plain.orderNumber,
    tableNumber: plain.tableNumber,
    table: plain.table ? String(plain.table._id || plain.table) : null,
    status: plain.status,
    statusHistory: plain.statusHistory || [],
    items: (plain.items || []).map((item) => ({
      id: String(item._id),
      menuItemId: String(item.menuItem),
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
      note: item.note || '',
    })),
    subtotal: plain.subtotal,
    taxPercent: plain.taxPercent,
    taxAmount: plain.taxAmount,
    totalAmount: plain.totalAmount,
    note: plain.note || '',
    isRated: Boolean(plain.isRated),
    customer: linkedCustomer
      ? {
          id: String(linkedCustomer._id),
          name: linkedCustomer.name,
          phone: linkedCustomer.phone,
        }
      : null,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
    servedAt: plain.servedAt || null,
  };
}

module.exports = {
  createOrder,
  transitionStatus,
  priceCart,
  upsertCustomer,
  nextOrderNumber,
  serializeOrder,
  round2,
};
