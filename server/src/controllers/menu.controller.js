'use strict';

const ApiError = require('../lib/ApiError');
const asyncHandler = require('../lib/asyncHandler');
const MenuItem = require('../models/MenuItem');
const Rating = require('../models/Rating');
const { emitToRestaurant, EVENTS } = require('../realtime/io');

/** Staff view: includes deactivated items so they can be brought back. */
const list = asyncHandler(async (req, res) => {
  const items = await MenuItem.find({ restaurant: req.restaurantId }).sort({
    category: 1,
    sortOrder: 1,
    name: 1,
  });

  res.json({ success: true, data: items });
});

const getOne = asyncHandler(async (req, res) => {
  const item = await MenuItem.findOne({ _id: req.params.id, restaurant: req.restaurantId });
  if (!item) throw ApiError.notFound('Menu item not found');
  res.json({ success: true, data: item });
});

/** UC8 / TC10 — add a dish; it appears on the customer menu immediately. */
const create = asyncHandler(async (req, res) => {
  const item = await MenuItem.create({ ...req.body, restaurant: req.restaurantId });

  emitToRestaurant(req.restaurantId, EVENTS.MENU_UPDATED, { action: 'created', id: item._id });
  res.status(201).json({ success: true, data: item });
});

const update = asyncHandler(async (req, res) => {
  const item = await MenuItem.findOneAndUpdate(
    { _id: req.params.id, restaurant: req.restaurantId },
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!item) throw ApiError.notFound('Menu item not found');

  emitToRestaurant(req.restaurantId, EVENTS.MENU_UPDATED, { action: 'updated', id: item._id });
  res.json({ success: true, data: item });
});

/**
 * RQ10 — availability toggle. Deactivating hides the dish from diners while
 * preserving its order history and ratings, which a hard delete would destroy.
 */
const toggleActive = asyncHandler(async (req, res) => {
  const item = await MenuItem.findOne({ _id: req.params.id, restaurant: req.restaurantId });
  if (!item) throw ApiError.notFound('Menu item not found');

  item.isActive = !item.isActive;
  await item.save();

  emitToRestaurant(req.restaurantId, EVENTS.MENU_UPDATED, { action: 'toggled', id: item._id });
  res.json({ success: true, data: item });
});

/**
 * Hard delete, admin only. Refused once the dish has been rated, because
 * removing it would orphan those ratings — deactivate instead.
 */
const remove = asyncHandler(async (req, res) => {
  const item = await MenuItem.findOne({ _id: req.params.id, restaurant: req.restaurantId });
  if (!item) throw ApiError.notFound('Menu item not found');

  if (item.ratingCount > 0 || item.orderCount > 0) {
    throw ApiError.conflict(
      'This dish already has order or rating history. Deactivate it instead of deleting it.'
    );
  }

  await item.deleteOne();
  emitToRestaurant(req.restaurantId, EVENTS.MENU_UPDATED, { action: 'deleted', id: item._id });

  res.json({ success: true, message: 'Menu item deleted' });
});

/** RQ8 — aggregated ratings and comments per dish, for the staff view. */
const ratingsOverview = asyncHandler(async (req, res) => {
  const items = await MenuItem.find({ restaurant: req.restaurantId })
    .select('name category avgRating ratingCount imageUrl')
    .sort({ avgRating: -1, ratingCount: -1 });

  const recent = await Rating.find({ restaurant: req.restaurantId })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('menuItem', 'name');

  res.json({
    success: true,
    data: {
      items,
      recentReviews: recent.map((r) => ({
        id: r._id,
        dish: r.menuItem ? r.menuItem.name : 'Removed dish',
        stars: r.stars,
        comment: r.comment,
        by: r.customerFirstName,
        createdAt: r.createdAt,
      })),
    },
  });
});

module.exports = { list, getOne, create, update, toggleActive, remove, ratingsOverview };
