'use strict';

const express = require('express');
const controller = require('../controllers/table.controller');
const { requireStaff, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { ROLES } = require('../models/StaffUser');
const { createTableSchema, bulkTablesSchema, idParam } = require('../validators/schemas');

const router = express.Router();

router.use(requireStaff);

router.get('/', controller.list);
router.get('/:id/qr.png', validate({ params: idParam }), controller.downloadQr);

// Creating tables and reissuing QR codes changes what is printed on the floor,
// so both are restricted to admins.
router.post('/', requireRole(ROLES.ADMIN), validate({ body: createTableSchema }), controller.create);
router.post(
  '/bulk',
  requireRole(ROLES.ADMIN),
  validate({ body: bulkTablesSchema }),
  controller.createBulk
);
router.put('/:id', requireRole(ROLES.ADMIN), validate({ params: idParam }), controller.update);
router.post(
  '/:id/regenerate-qr',
  requireRole(ROLES.ADMIN),
  validate({ params: idParam }),
  controller.regenerateQr
);
router.delete('/:id', requireRole(ROLES.ADMIN), validate({ params: idParam }), controller.remove);

module.exports = router;
