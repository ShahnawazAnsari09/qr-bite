'use strict';

/**
 * Everything a diner's phone calls after scanning the table QR code. None of
 * these routes require a staff login — the table code in the URL is what proves
 * the customer is sitting in the restaurant.
 */

const ApiError = require('../lib/ApiError');
const asyncHandler = require('../lib/asyncHandler');
const { signCustomerToken } = require('../lib/tokens');
const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');
const { ORDER_STATUS } = require('../models/Order');
const Rating = require('../models/Rating');
const Restaurant = require('../models/Restaurant');
const ServiceRequest = require('../models/ServiceRequest');
const Table = require('../models/Table');
const orderService = require('../services/order.service');
const ratingService = require('../services/rating.service');
const whatsapp = require('../services/whatsapp');
const { emitToRestaurant, EVENTS } = require('../realtime/io');

/** Resolves a scanned code to its table + restaurant, or 404s. */
async function resolveTable(code) {
  const table = await Table.findOne({ code });
  if (!table) throw ApiError.notFound('This QR code is not recognised. Please ask a staff member.');
  if (!table.isActive) throw ApiError.conflict('This table is not currently in service.');

  const restaurant = await Restaurant.findById(table.restaurant);
  if (!restaurant || !restaurant.isActive) throw ApiError.notFound('Restaurant not found');

  return { table, restaurant };
}

/**
 * UC1 / UC2 / TC1-TC3 — the landing payload for a scanned table: who the
 * restaurant is, which table this is, and the live menu with its ratings.
 * Deactivated dishes are filtered out here, which is what makes the staff
 * availability toggle visible to diners instantly.
 */
const getTableMenu = asyncHandler(async (req, res) => {
  const { table, restaurant } = await resolveTable(req.params.code);

  const items = await MenuItem.find({ restaurant: restaurant._id, isActive: true })
    .select('name description price category imageUrl isVegetarian spiceLevel preparationMinutes avgRating ratingCount orderCount sortOrder')
    .sort({ category: 1, sortOrder: 1, name: 1 });

  // Group by category so the client can render sections without regrouping.
  const categories = [];
  const indexByName = new Map();
  for (const item of items) {
    if (!indexByName.has(item.category)) {
      indexByName.set(item.category, categories.length);
      categories.push({ name: item.category, items: [] });
    }
    categories[indexByName.get(item.category)].items.push(item);
  }

  res.json({
    success: true,
    data: {
      restaurant: {
        id: restaurant._id,
        name: restaurant.name,
        address: restaurant.address,
        currencySymbol: restaurant.currencySymbol,
        taxPercent: restaurant.taxPercent,
        logoUrl: restaurant.logoUrl,
      },
      table: {
        id: table._id,
        code: table.code,
        tableNumber: table.tableNumber,
        label: table.label,
        displayName: table.displayName,
      },
      categories,
      itemCount: items.length,
    },
  });
});

/** Public review list for one dish, shown when a diner expands it. */
const getItemReviews = asyncHandler(async (req, res) => {
  const reviews = await Rating.find({ menuItem: req.params.id })
    .sort({ createdAt: -1 })
    .limit(20)
    .select('stars comment customerFirstName createdAt');

  res.json({ success: true, data: reviews });
});

/**
 * UC3 / TC4 — place the order. The cart is re-priced from the database inside
 * the service, so the totals returned here are the restaurant's, not the
 * browser's. Returns a narrow customer token the diner uses to track and later
 * rate this one order.
 */
const placeOrder = asyncHandler(async (req, res) => {
  const { table, restaurant } = await resolveTable(req.body.tableCode);

  const { order, customer } = await orderService.createOrder({
    restaurant,
    table,
    customerInput: req.body.customer,
    items: req.body.items,
    note: req.body.note,
  });

  const serialized = orderService.serializeOrder(order, customer);

  // RQ5 / TC5 — the kitchen monitor learns about the order without polling.
  emitToRestaurant(restaurant._id, EVENTS.ORDER_NEW, serialized);

  // RQ8 / TC7 — confirmation on WhatsApp. dispatch() records failures rather
  // than throwing, so a messaging outage cannot fail a placed order.
  const message = await whatsapp.sendOrderConfirmation({ restaurant, customer, order });

  res.status(201).json({
    success: true,
    message: 'Order placed. The kitchen has been notified.',
    data: {
      order: serialized,
      orderToken: signCustomerToken({
        orderId: order._id,
        customerId: customer._id,
        restaurantId: restaurant._id,
      }),
      whatsapp: { status: message.deliveryStatus, provider: message.provider },
    },
  });
});

/** UC5 / TC6 — live status of the order behind the current customer token. */
const getMyOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.customerSession.orderId).populate('customer', 'name phone');
  if (!order) throw ApiError.notFound('Order not found');

  const restaurant = await Restaurant.findById(order.restaurant).select('name currencySymbol');

  res.json({
    success: true,
    data: {
      order: orderService.serializeOrder(order),
      restaurant,
    },
  });
});

/**
 * UC6 / TC11 — rate the dishes from this order. Only allowed once the order has
 * been served: rating food that has not arrived would be meaningless, and it is
 * the trigger the report specifies for the feedback prompt.
 */
const submitRatings = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.customerSession.orderId).populate('customer', 'name');
  if (!order) throw ApiError.notFound('Order not found');

  if (order.status !== ORDER_STATUS.SERVED) {
    throw ApiError.conflict('You can rate your dishes once the order has been served.');
  }

  const orderedIds = new Set(order.items.map((item) => String(item.menuItem)));
  const firstName = String(order.customer?.name || 'Guest').split(' ')[0];

  const saved = [];
  for (const entry of req.body.ratings) {
    if (!orderedIds.has(String(entry.menuItemId))) {
      throw ApiError.badRequest('You can only rate dishes that were part of your order.');
    }

    // eslint-disable-next-line no-await-in-loop
    const { rating, menuItem } = await ratingService.submitRating({
      restaurantId: order.restaurant,
      orderId: order._id,
      customerId: order.customer._id,
      customerFirstName: firstName,
      menuItemId: entry.menuItemId,
      stars: entry.stars,
      comment: entry.comment,
    });

    saved.push({
      menuItemId: String(menuItem._id),
      dish: menuItem.name,
      stars: rating.stars,
      comment: rating.comment,
      avgRating: menuItem.avgRating,
      ratingCount: menuItem.ratingCount,
    });
  }

  order.isRated = true;
  await order.save();

  emitToRestaurant(order.restaurant, EVENTS.RATING_NEW, {
    orderId: String(order._id),
    orderNumber: order.orderNumber,
    tableNumber: order.tableNumber,
    ratings: saved,
  });
  // Keeps the menu's star averages current for anyone else browsing.
  emitToRestaurant(order.restaurant, EVENTS.MENU_UPDATED, { action: 'rated' });

  res.status(201).json({
    success: true,
    message: 'Thanks for your feedback!',
    data: saved,
  });
});

/** RQ10 / TC8 — "Call waiter" button. Stored so it survives a dropped socket. */
const createServiceRequest = asyncHandler(async (req, res) => {
  const { table, restaurant } = await resolveTable(req.body.tableCode);

  const request = await ServiceRequest.create({
    restaurant: restaurant._id,
    table: table._id,
    tableNumber: table.tableNumber,
    type: req.body.type,
  });

  emitToRestaurant(restaurant._id, EVENTS.SERVICE_REQUEST, {
    id: String(request._id),
    tableNumber: request.tableNumber,
    type: request.type,
    createdAt: request.createdAt,
  });

  res.status(201).json({
    success: true,
    message: 'A staff member has been notified.',
    data: { id: request._id, type: request.type },
  });
});

module.exports = {
  getTableMenu,
  getItemReviews,
  placeOrder,
  getMyOrder,
  submitRatings,
  createServiceRequest,
};
