'use strict';

const ApiError = require('../lib/ApiError');
const asyncHandler = require('../lib/asyncHandler');
const Order = require('../models/Order');
const Table = require('../models/Table');
const qrService = require('../services/qr.service');

/** Attaches the QR image and target URL to a table document for the client. */
async function withQr(table) {
  const url = qrService.buildTableUrl(table.code);
  const qrCodeUrl = table.qrCodeUrl || (await qrService.generateTableQrDataUrl(table.code));
  return { ...table.toObject(), url, qrCodeUrl };
}

const list = asyncHandler(async (req, res) => {
  const tables = await Table.find({ restaurant: req.restaurantId }).sort({ tableNumber: 1 });
  const data = await Promise.all(tables.map(withQr));
  res.json({ success: true, data });
});

/** RQ2 — create a table and mint its unique QR code. */
const create = asyncHandler(async (req, res) => {
  const exists = await Table.findOne({
    restaurant: req.restaurantId,
    tableNumber: req.body.tableNumber,
  });
  if (exists) throw ApiError.conflict(`Table ${req.body.tableNumber} already exists`);

  const table = await Table.create({ ...req.body, restaurant: req.restaurantId });
  table.qrCodeUrl = await qrService.generateTableQrDataUrl(table.code);
  await table.save();

  res.status(201).json({ success: true, data: await withQr(table) });
});

/** Convenience for onboarding: create a contiguous run of tables at once. */
const createBulk = asyncHandler(async (req, res) => {
  const { from, to, seats } = req.body;
  if (to < from) throw ApiError.badRequest('"to" must be greater than or equal to "from"');
  if (to - from > 100) throw ApiError.badRequest('Create at most 100 tables at a time');

  const existing = await Table.find({
    restaurant: req.restaurantId,
    tableNumber: { $gte: from, $lte: to },
  }).select('tableNumber');
  const taken = new Set(existing.map((t) => t.tableNumber));

  const created = [];
  for (let n = from; n <= to; n += 1) {
    if (taken.has(n)) continue;
    // eslint-disable-next-line no-await-in-loop
    const table = await Table.create({ restaurant: req.restaurantId, tableNumber: n, seats });
    // eslint-disable-next-line no-await-in-loop
    table.qrCodeUrl = await qrService.generateTableQrDataUrl(table.code);
    // eslint-disable-next-line no-await-in-loop
    await table.save();
    created.push(table);
  }

  res.status(201).json({
    success: true,
    message: `Created ${created.length} table(s); skipped ${taken.size} that already existed`,
    data: await Promise.all(created.map(withQr)),
  });
});

const update = asyncHandler(async (req, res) => {
  const table = await Table.findOneAndUpdate(
    { _id: req.params.id, restaurant: req.restaurantId },
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!table) throw ApiError.notFound('Table not found');
  res.json({ success: true, data: await withQr(table) });
});

/**
 * Issues a fresh code for a table whose printed QR was damaged or leaked.
 * Existing orders keep pointing at the same table document, so history is
 * unaffected — only the public URL changes.
 */
const regenerateQr = asyncHandler(async (req, res) => {
  const table = await Table.findOne({ _id: req.params.id, restaurant: req.restaurantId });
  if (!table) throw ApiError.notFound('Table not found');

  const { randomCode } = require('../lib/crypto');
  table.code = randomCode(6);
  table.qrCodeUrl = await qrService.generateTableQrDataUrl(table.code);
  await table.save();

  res.json({ success: true, message: 'QR code regenerated. Reprint and replace the table card.', data: await withQr(table) });
});

/** Downloadable PNG for printing a single table card. */
const downloadQr = asyncHandler(async (req, res) => {
  const table = await Table.findOne({ _id: req.params.id, restaurant: req.restaurantId });
  if (!table) throw ApiError.notFound('Table not found');

  const buffer = await qrService.generateTableQrBuffer(table.code);
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `attachment; filename="table-${table.tableNumber}-qr.png"`);
  res.send(buffer);
});

const remove = asyncHandler(async (req, res) => {
  const table = await Table.findOne({ _id: req.params.id, restaurant: req.restaurantId });
  if (!table) throw ApiError.notFound('Table not found');

  const orderCount = await Order.countDocuments({ table: table._id });
  if (orderCount > 0) {
    throw ApiError.conflict(
      'This table has order history. Deactivate it instead so past orders remain readable.'
    );
  }

  await table.deleteOne();
  res.json({ success: true, message: 'Table deleted' });
});

module.exports = { list, create, createBulk, update, regenerateQr, downloadQr, remove };
