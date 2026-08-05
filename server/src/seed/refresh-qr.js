'use strict';

/**
 * Re-renders the stored QR image on every table so it encodes the current
 * CLIENT_URL, without issuing new table codes.
 *
 *   npm run refresh:qr --workspace server
 *
 * Tables cache their QR as a data URL (see table.controller `withQr`), which is
 * baked at creation time. Move the site to a new address — a LAN IP, a tunnel,
 * a real domain — and those cached images still point at the old one. The
 * dashboard's "regenerate QR" button fixes that too, but it also mints a new
 * table code, which invalidates any card already printed. This only redraws the
 * image, so printed codes that are still correct stay correct.
 */

const { connectDatabase, disconnectDatabase } = require('../config/db');
const env = require('../config/env');
const logger = require('../lib/logger');
const Table = require('../models/Table');
const qrService = require('../services/qr.service');

async function run() {
  await connectDatabase();

  const tables = await Table.find({}).sort({ tableNumber: 1 });
  if (!tables.length) {
    logger.info('No tables found — nothing to refresh.');
    await disconnectDatabase();
    return;
  }

  for (const table of tables) {
    // eslint-disable-next-line no-await-in-loop
    table.qrCodeUrl = await qrService.generateTableQrDataUrl(table.code);
    // eslint-disable-next-line no-await-in-loop
    await table.save();
  }

  logger.info(`Refreshed ${tables.length} table QR code(s) against ${env.clientUrl}`);
  tables.slice(0, 3).forEach((t) => {
    logger.info(`  Table ${t.tableNumber}: ${qrService.buildTableUrl(t.code)}`);
  });

  await disconnectDatabase();
}

run().catch(async (err) => {
  logger.error('QR refresh failed:', err.stack || err.message);
  process.exit(1);
});
