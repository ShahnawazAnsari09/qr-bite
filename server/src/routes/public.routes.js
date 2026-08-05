'use strict';

const express = require('express');
const controller = require('../controllers/public.controller');
const { requireCustomer } = require('../middleware/auth');
const { orderLimiter, serviceRequestLimiter } = require('../middleware/rateLimit');
const validate = require('../middleware/validate');
const {
  placeOrderSchema,
  submitRatingsSchema,
  serviceRequestSchema,
  codeParam,
  idParam,
} = require('../validators/schemas');

const router = express.Router();

/** UC1 — the page a scanned QR code lands on. */
router.get('/tables/:code', validate({ params: codeParam }), controller.getTableMenu);
router.get('/menu-items/:id/reviews', validate({ params: idParam }), controller.getItemReviews);

router.post('/orders', orderLimiter, validate({ body: placeOrderSchema }), controller.placeOrder);

// Both routes below are scoped to the single order named in the customer token.
router.get('/orders/mine', requireCustomer, controller.getMyOrder);
router.post(
  '/orders/mine/ratings',
  requireCustomer,
  validate({ body: submitRatingsSchema }),
  controller.submitRatings
);

router.post(
  '/service-requests',
  serviceRequestLimiter,
  validate({ body: serviceRequestSchema }),
  controller.createServiceRequest
);

module.exports = router;
