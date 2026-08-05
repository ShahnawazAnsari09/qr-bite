'use strict';

const QRCode = require('qrcode');
const env = require('../config/env');

/**
 * The URL a table's QR code resolves to. CLIENT_URL must be reachable from a
 * customer's phone — on a real restaurant network that is the machine's LAN
 * address, not localhost.
 */
function buildTableUrl(tableCode) {
  return `${env.clientUrl.replace(/\/+$/, '')}/t/${tableCode}`;
}

/** Renders a PNG data-URL suitable for embedding in the dashboard and printing. */
async function generateTableQrDataUrl(tableCode, options = {}) {
  return QRCode.toDataURL(buildTableUrl(tableCode), {
    errorCorrectionLevel: 'M',
    margin: 2,
    scale: 8,
    color: { dark: '#111827', light: '#FFFFFF' },
    ...options,
  });
}

/** Vector output, used by the printable QR sheet so codes stay crisp on paper. */
async function generateTableQrSvg(tableCode) {
  return QRCode.toString(buildTableUrl(tableCode), {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
  });
}

async function generateTableQrBuffer(tableCode) {
  return QRCode.toBuffer(buildTableUrl(tableCode), {
    errorCorrectionLevel: 'M',
    margin: 2,
    scale: 10,
  });
}

module.exports = {
  buildTableUrl,
  generateTableQrDataUrl,
  generateTableQrSvg,
  generateTableQrBuffer,
};
