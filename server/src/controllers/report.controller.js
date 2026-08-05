'use strict';

/**
 * RQ11 — the reports screen: today's takings, a daily trend, best sellers and
 * feedback summary. All of it is aggregated in MongoDB rather than pulled into
 * Node, so the numbers stay cheap as order history grows.
 */

const asyncHandler = require('../lib/asyncHandler');
const Customer = require('../models/Customer');
const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');
const { ORDER_STATUS } = require('../models/Order');
const Rating = require('../models/Rating');
const Table = require('../models/Table');
const WhatsAppMessage = require('../models/WhatsAppMessage');
const { DELIVERY_STATUS } = require('../models/WhatsAppMessage');

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(days) {
  const d = startOfToday();
  d.setDate(d.getDate() - (days - 1));
  return d;
}

/** Cancelled tickets are excluded from every revenue figure. */
const EARNING = { $ne: ORDER_STATUS.CANCELLED };

const summary = asyncHandler(async (req, res) => {
  const restaurant = req.restaurantId;
  const since = daysAgo(req.query.days);
  const today = startOfToday();

  const [
    todayTotals,
    periodTotals,
    dailySeries,
    statusBreakdown,
    topSelling,
    topRated,
    customerCount,
    newCustomers,
    ratingStats,
    messageStats,
    activeOrders,
    tableCount,
    menuCount,
  ] = await Promise.all([
    Order.aggregate([
      { $match: { restaurant, status: EARNING, createdAt: { $gte: today } } },
      { $group: { _id: null, orders: { $sum: 1 }, revenue: { $sum: '$totalAmount' } } },
    ]),
    Order.aggregate([
      { $match: { restaurant, status: EARNING, createdAt: { $gte: since } } },
      { $group: { _id: null, orders: { $sum: 1 }, revenue: { $sum: '$totalAmount' } } },
    ]),
    Order.aggregate([
      { $match: { restaurant, status: EARNING, createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          orders: { $sum: 1 },
          revenue: { $sum: '$totalAmount' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Order.aggregate([
      { $match: { restaurant, createdAt: { $gte: since } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: { restaurant, status: EARNING, createdAt: { $gte: since } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.menuItem',
          name: { $first: '$items.name' },
          quantity: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.lineTotal' },
        },
      },
      { $sort: { quantity: -1 } },
      { $limit: 8 },
    ]),
    MenuItem.find({ restaurant, ratingCount: { $gt: 0 } })
      .select('name category avgRating ratingCount')
      .sort({ avgRating: -1, ratingCount: -1 })
      .limit(8),
    Customer.countDocuments({ restaurant }),
    Customer.countDocuments({ restaurant, createdAt: { $gte: since } }),
    Rating.aggregate([
      { $match: { restaurant, createdAt: { $gte: since } } },
      { $group: { _id: null, count: { $sum: 1 }, avgStars: { $avg: '$stars' } } },
    ]),
    WhatsAppMessage.aggregate([
      { $match: { restaurant, createdAt: { $gte: since } } },
      { $group: { _id: '$deliveryStatus', count: { $sum: 1 } } },
    ]),
    Order.countDocuments({
      restaurant,
      status: { $in: [ORDER_STATUS.RECEIVED, ORDER_STATUS.PREPARING] },
    }),
    Table.countDocuments({ restaurant }),
    MenuItem.countDocuments({ restaurant, isActive: true }),
  ]);

  const round2 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
  const firstOr = (rows, field, fallback = 0) => (rows[0] ? rows[0][field] : fallback);

  // Fill gaps so a day with no orders still appears on the chart as a zero.
  const seriesByDate = new Map(dailySeries.map((row) => [row._id, row]));
  const trend = [];
  for (let i = 0; i < req.query.days; i += 1) {
    const day = new Date(since);
    day.setDate(day.getDate() + i);
    const key = day.toISOString().slice(0, 10);
    const row = seriesByDate.get(key);
    trend.push({
      date: key,
      orders: row ? row.orders : 0,
      revenue: round2(row ? row.revenue : 0),
    });
  }

  const statusCounts = Object.values(ORDER_STATUS).reduce((acc, status) => {
    const row = statusBreakdown.find((s) => s._id === status);
    acc[status] = row ? row.count : 0;
    return acc;
  }, {});

  const messageCounts = Object.values(DELIVERY_STATUS).reduce((acc, status) => {
    const row = messageStats.find((s) => s._id === status);
    acc[status] = row ? row.count : 0;
    return acc;
  }, {});

  const periodOrders = firstOr(periodTotals, 'orders');
  const periodRevenue = round2(firstOr(periodTotals, 'revenue'));

  res.json({
    success: true,
    data: {
      days: req.query.days,
      from: since,
      today: {
        orders: firstOr(todayTotals, 'orders'),
        revenue: round2(firstOr(todayTotals, 'revenue')),
      },
      period: {
        orders: periodOrders,
        revenue: periodRevenue,
        averageOrderValue: periodOrders ? round2(periodRevenue / periodOrders) : 0,
      },
      trend,
      statusCounts,
      topSelling: topSelling.map((row) => ({
        menuItemId: row._id,
        name: row.name,
        quantity: row.quantity,
        revenue: round2(row.revenue),
      })),
      topRated,
      feedback: {
        count: firstOr(ratingStats, 'count'),
        averageStars: round2(firstOr(ratingStats, 'avgStars')),
      },
      customers: { total: customerCount, new: newCustomers },
      whatsapp: messageCounts,
      snapshot: { activeOrders, tableCount, menuCount },
    },
  });
});

module.exports = { summary };
