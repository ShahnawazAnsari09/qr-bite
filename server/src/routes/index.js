'use strict';

const express = require('express');

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({ success: true, status: 'ok', uptime: Math.round(process.uptime()) });
});

// Customer-facing, reached by scanning a table QR code — no login required.
router.use('/public', require('./public.routes'));

// Staff dashboard; every route inside requires a JWT.
router.use('/auth', require('./auth.routes'));
router.use('/menu', require('./menu.routes'));
router.use('/tables', require('./table.routes'));
router.use('/orders', require('./order.routes'));
router.use('/customers', require('./customer.routes'));
router.use('/reports', require('./report.routes'));
// WhatsApp webhook for Meta
router.use('/whatsapp/webhook', require('./whatsapp.webhook.routes'));
module.exports = router;
