'use strict';

const express = require('express');
const controller = require('../controllers/order.controller');
const { requireStaff } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { orderQuerySchema, updateStatusSchema, idParam } = require('../validators/schemas');

const router = express.Router();

router.use(requireStaff);

/** The live kitchen monitor polls this once on load, then listens on the socket. */
router.get('/live', controller.live);
router.get('/', validate({ query: orderQuerySchema }), controller.list);

router.get('/service-requests', controller.listServiceRequests);
router.patch(
  '/service-requests/:id/resolve',
  validate({ params: idParam }),
  controller.resolveServiceRequest
);

router.get('/:id', validate({ params: idParam }), controller.getOne);
router.patch(
  '/:id/status',
  validate({ params: idParam, body: updateStatusSchema }),
  controller.updateStatus
);

module.exports = router;
