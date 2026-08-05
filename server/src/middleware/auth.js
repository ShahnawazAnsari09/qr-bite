'use strict';

const ApiError = require('../lib/ApiError');
const { verifyToken, SCOPE } = require('../lib/tokens');
const StaffUser = require('../models/StaffUser');

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

/**
 * Guards every staff-facing route. Rejects tokens whose account has since been
 * deactivated, so revoking access does not have to wait for token expiry.
 */
async function requireStaff(req, _res, next) {
  try {
    const token = extractToken(req);
    if (!token) throw ApiError.unauthorized('Missing authentication token');

    let payload;
    try {
      payload = verifyToken(token);
    } catch (err) {
      throw ApiError.unauthorized(
        err.name === 'TokenExpiredError' ? 'Session expired, please log in again' : 'Invalid token'
      );
    }

    if (payload.scope !== SCOPE.STAFF) throw ApiError.forbidden('Staff credentials required');

    const staff = await StaffUser.findById(payload.sub);
    if (!staff || !staff.isActive) throw ApiError.unauthorized('Account is no longer active');

    req.staff = staff;
    req.restaurantId = staff.restaurant;
    next();
  } catch (err) {
    next(err);
  }
}

/** Role-based access control (Chapter 4.4 "RBAC"). */
function requireRole(...roles) {
  return function guard(req, _res, next) {
    if (!req.staff) return next(ApiError.unauthorized());
    if (!roles.includes(req.staff.role)) {
      return next(ApiError.forbidden(`This action requires role: ${roles.join(' or ')}`));
    }
    return next();
  };
}

/** Guards the two order-scoped endpoints a diner may call after checkout. */
function requireCustomer(req, _res, next) {
  try {
    const token = extractToken(req);
    if (!token) throw ApiError.unauthorized('Missing order token');

    let payload;
    try {
      payload = verifyToken(token);
    } catch (err) {
      throw ApiError.unauthorized(
        err.name === 'TokenExpiredError' ? 'This order link has expired' : 'Invalid order token'
      );
    }

    if (payload.scope !== SCOPE.CUSTOMER) throw ApiError.forbidden('Customer order token required');

    req.customerSession = {
      customerId: payload.sub,
      orderId: payload.order,
      restaurantId: payload.restaurant,
    };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireStaff, requireRole, requireCustomer };
