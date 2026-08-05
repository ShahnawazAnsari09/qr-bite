'use strict';

const express = require('express');
const controller = require('../controllers/customer.controller');
const { requireStaff, requireRole } = require('../middleware/auth');
const { whatsappLimiter } = require('../middleware/rateLimit');
const validate = require('../middleware/validate');
const { ROLES } = require('../models/StaffUser');
const { customerQuerySchema, broadcastSchema, pagination, idParam } = require('../validators/schemas');

const router = express.Router();

router.use(requireStaff);

router.get('/', validate({ query: customerQuerySchema }), controller.list);
router.get('/messages', validate({ query: pagination }), controller.messageLog);
router.get('/:id', validate({ params: idParam }), controller.getOne);
router.patch('/:id/opt-in', validate({ params: idParam }), controller.toggleOptIn);

/**
 * Broadcasting is admin-only and hourly rate limited — a mistake here reaches
 * every customer's phone and cannot be recalled.
 */
router.post(
  '/broadcast',
  requireRole(ROLES.ADMIN),
  whatsappLimiter,
  validate({ body: broadcastSchema }),
  controller.broadcast
);

module.exports = router;
