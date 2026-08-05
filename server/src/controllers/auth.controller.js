'use strict';

const ApiError = require('../lib/ApiError');
const asyncHandler = require('../lib/asyncHandler');
const { signStaffToken } = require('../lib/tokens');
const Restaurant = require('../models/Restaurant');
const StaffUser = require('../models/StaffUser');
const { ROLES } = require('../models/StaffUser');

/** UC7 / TC9 — staff login. */
const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  const staff = await StaffUser.findOne({ username: username.toLowerCase() }).select('+passwordHash');

  // Same message for unknown user and wrong password so the endpoint cannot be
  // used to enumerate valid usernames.
  const invalid = ApiError.unauthorized('Invalid username or password');
  if (!staff) throw invalid;
  if (!staff.isActive) throw ApiError.forbidden('This account has been deactivated');

  const ok = await staff.verifyPassword(password);
  if (!ok) throw invalid;

  staff.lastLoginAt = new Date();
  await staff.save();

  const restaurant = await Restaurant.findById(staff.restaurant);

  res.json({
    success: true,
    data: {
      token: signStaffToken(staff),
      user: {
        id: staff._id,
        name: staff.name,
        username: staff.username,
        role: staff.role,
      },
      restaurant: restaurant
        ? {
            id: restaurant._id,
            name: restaurant.name,
            currencySymbol: restaurant.currencySymbol,
            taxPercent: restaurant.taxPercent,
          }
        : null,
    },
  });
});

/** Returns the session behind the current token, used to rehydrate the UI. */
const me = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findById(req.staff.restaurant);

  res.json({
    success: true,
    data: {
      user: {
        id: req.staff._id,
        name: req.staff.name,
        username: req.staff.username,
        role: req.staff.role,
        lastLoginAt: req.staff.lastLoginAt,
      },
      restaurant: restaurant
        ? {
            id: restaurant._id,
            name: restaurant.name,
            address: restaurant.address,
            currencySymbol: restaurant.currencySymbol,
            taxPercent: restaurant.taxPercent,
          }
        : null,
    },
  });
});

/** Admin-only staff provisioning; there is no public sign-up. */
const createStaff = asyncHandler(async (req, res) => {
  const { name, username, password, role } = req.body;

  const exists = await StaffUser.findOne({ restaurant: req.restaurantId, username });
  if (exists) throw ApiError.conflict('That username is already taken');

  const staff = await StaffUser.create({
    restaurant: req.restaurantId,
    name,
    username,
    passwordHash: await StaffUser.hashPassword(password),
    role,
  });

  res.status(201).json({ success: true, data: staff.toJSON() });
});

const listStaff = asyncHandler(async (req, res) => {
  const staff = await StaffUser.find({ restaurant: req.restaurantId }).sort({ createdAt: 1 });
  res.json({ success: true, data: staff.map((s) => s.toJSON()) });
});

const setStaffActive = asyncHandler(async (req, res) => {
  if (String(req.params.id) === String(req.staff._id)) {
    throw ApiError.badRequest('You cannot deactivate your own account');
  }

  const staff = await StaffUser.findOne({ _id: req.params.id, restaurant: req.restaurantId });
  if (!staff) throw ApiError.notFound('Staff member not found');

  staff.isActive = !staff.isActive;
  await staff.save();

  res.json({ success: true, data: staff.toJSON() });
});

module.exports = { login, me, createStaff, listStaff, setStaffActive, ROLES };
