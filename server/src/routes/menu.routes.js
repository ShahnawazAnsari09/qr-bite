'use strict';

const express = require('express');
const controller = require('../controllers/menu.controller');
const { requireStaff, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { ROLES } = require('../models/StaffUser');
const { menuItemSchema, menuItemUpdateSchema, idParam } = require('../validators/schemas');

const router = express.Router();

// Every route below is staff-only; diners read the menu through /api/public.
router.use(requireStaff);

router.get('/', controller.list);
router.get('/ratings', controller.ratingsOverview);
router.get('/:id', validate({ params: idParam }), controller.getOne);

router.post('/', validate({ body: menuItemSchema }), controller.create);
router.put(
  '/:id',
  validate({ params: idParam, body: menuItemUpdateSchema }),
  controller.update
);
router.patch('/:id/active', validate({ params: idParam }), controller.toggleActive);
router.delete('/:id', requireRole(ROLES.ADMIN), validate({ params: idParam }), controller.remove);

module.exports = router;
