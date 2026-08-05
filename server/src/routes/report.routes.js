'use strict';

const express = require('express');
const controller = require('../controllers/report.controller');
const { requireStaff } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { reportQuerySchema } = require('../validators/schemas');

const router = express.Router();

router.use(requireStaff);

router.get('/summary', validate({ query: reportQuerySchema }), controller.summary);

module.exports = router;
