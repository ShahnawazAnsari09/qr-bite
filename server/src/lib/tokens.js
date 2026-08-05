'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');

const SCOPE = Object.freeze({ STAFF: 'staff', CUSTOMER: 'customer' });

/** Token for a logged-in restaurant employee (Chapter 4.1, module 9). */
function signStaffToken(staffUser) {
  return jwt.sign(
    {
      scope: SCOPE.STAFF,
      sub: String(staffUser._id),
      restaurant: String(staffUser.restaurant),
      role: staffUser.role,
      username: staffUser.username,
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

/**
 * Narrow token handed to a diner after checkout. It authorises exactly two
 * things — reading that one order's status and rating that order's dishes — so
 * a leaked token cannot be used to browse other customers' data.
 */
function signCustomerToken({ orderId, customerId, restaurantId }) {
  return jwt.sign(
    {
      scope: SCOPE.CUSTOMER,
      sub: String(customerId),
      order: String(orderId),
      restaurant: String(restaurantId),
    },
    env.jwtSecret,
    { expiresIn: env.customerTokenExpiresIn }
  );
}

function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

module.exports = { signStaffToken, signCustomerToken, verifyToken, SCOPE };
