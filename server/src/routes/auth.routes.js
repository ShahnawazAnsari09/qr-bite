'use strict';

const express = require('express');
const controller = require('../controllers/auth.controller');
const { requireStaff, requireRole } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimit');
const validate = require('../middleware/validate');
const { ROLES } = require('../models/StaffUser');
const { loginSchema, createStaffSchema, idParam } = require('../validators/schemas');

const router = express.Router();

router.post('/login', loginLimiter, validate({ body: loginSchema }), controller.login);
router.get('/me', requireStaff, controller.me);

// Staff accounts are provisioned by an admin; there is no public sign-up.
router.get('/staff', requireStaff, requireRole(ROLES.ADMIN), controller.listStaff);
router.post(
  '/staff',
  requireStaff,
  requireRole(ROLES.ADMIN),
  validate({ body: createStaffSchema }),
  controller.createStaff
);
router.patch(
  '/staff/:id/active',
  requireStaff,
  requireRole(ROLES.ADMIN),
  validate({ params: idParam }),
  controller.setStaffActive
);

module.exports = router;
