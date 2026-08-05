'use strict';

const ApiError = require('../lib/ApiError');
const MenuItem = require('../models/MenuItem');
const Rating = require('../models/Rating');

/**
 * Records a diner's rating for one dish in one order and folds it into that
 * dish's running average (Chapter 4.1, module 6).
 *
 * Re-rating the same dish on the same order replaces the earlier score rather
 * than adding a second vote, so a customer cannot skew an average by tapping
 * submit repeatedly.
 */
async function submitRating({ restaurantId, orderId, customerId, customerFirstName, menuItemId, stars, comment }) {
  const menuItem = await MenuItem.findOne({ _id: menuItemId, restaurant: restaurantId });
  if (!menuItem) throw ApiError.notFound('Dish not found');

  const existing = await Rating.findOne({ order: orderId, menuItem: menuItemId });

  if (existing) {
    const delta = stars - existing.stars;
    existing.stars = stars;
    existing.comment = comment || '';
    await existing.save();

    if (delta !== 0) {
      menuItem.ratingSum += delta;
      menuItem.refreshAverage();
      await menuItem.save();
    }

    return { rating: existing, menuItem, created: false };
  }

  const rating = await Rating.create({
    restaurant: restaurantId,
    menuItem: menuItemId,
    customer: customerId,
    order: orderId,
    stars,
    comment: comment || '',
    customerFirstName: customerFirstName || 'Guest',
  });

  menuItem.ratingSum += stars;
  menuItem.ratingCount += 1;
  menuItem.refreshAverage();
  await menuItem.save();

  return { rating, menuItem, created: true };
}

/**
 * Rebuilds every cached average from the ratings collection. Not used in the
 * normal flow — kept as a repair path in case the denormalised counters drift.
 */
async function recomputeAverages(restaurantId) {
  const grouped = await Rating.aggregate([
    { $match: { restaurant: restaurantId } },
    { $group: { _id: '$menuItem', sum: { $sum: '$stars' }, count: { $sum: 1 } } },
  ]);

  const byId = new Map(grouped.map((g) => [String(g._id), g]));
  const items = await MenuItem.find({ restaurant: restaurantId });

  const operations = items.map((item) => {
    const stats = byId.get(String(item._id)) || { sum: 0, count: 0 };
    const avg = stats.count ? Number((stats.sum / stats.count).toFixed(2)) : 0;
    return {
      updateOne: {
        filter: { _id: item._id },
        update: { $set: { ratingSum: stats.sum, ratingCount: stats.count, avgRating: avg } },
      },
    };
  });

  if (operations.length) await MenuItem.bulkWrite(operations);
  return operations.length;
}

module.exports = { submitRating, recomputeAverages };
