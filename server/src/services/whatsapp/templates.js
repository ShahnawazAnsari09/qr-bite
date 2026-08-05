'use strict';

/**
 * Message bodies for the three automated flows plus admin campaigns.
 * Kept in one place so wording can be tuned without touching the send logic,
 * and so the variable order here matches the ordered placeholders that Meta's
 * approved templates expect.
 */

function formatCurrency(amount, symbol = '₹') {
  return `${symbol}${Number(amount || 0).toFixed(2)}`;
}

function orderConfirmation({ customerName, restaurantName, order, currencySymbol = '₹' }) {
  const lines = order.items
    .map((item) => `  • ${item.name} x${item.quantity} — ${formatCurrency(item.lineTotal, currencySymbol)}`)
    .join('\n');

  return [
    `Hi ${customerName}, your order at ${restaurantName} is confirmed.`,
    '',
    `Order: ${order.orderNumber}`,
    `Table: ${order.tableNumber}`,
    '',
    lines,
    '',
    `Total: ${formatCurrency(order.totalAmount, currencySymbol)}`,
    '',
    'We are preparing it now. Thank you for dining with us!',
  ].join('\n');
}

function orderServed({ customerName, restaurantName, order }) {
  return [
    `${customerName}, order ${order.orderNumber} has been served. Enjoy your meal!`,
    '',
    `Do tell us how it was — you can rate the dishes on the same page you ordered from.`,
    '',
    `— ${restaurantName}`,
  ].join('\n');
}

/**
 * Substitutes {{name}} and {{restaurant}} into an admin-written campaign body
 * so a single broadcast still reads as a personal message.
 */
function renderCampaign({ body, customerName, restaurantName }) {
  return String(body)
    .replace(/\{\{\s*name\s*\}\}/gi, customerName || 'there')
    .replace(/\{\{\s*restaurant\s*\}\}/gi, restaurantName || '');
}

/** Ordered variables for Meta's numbered template placeholders ({{1}}, {{2}}…). */
function orderConfirmationTemplateVars({ customerName, order, currencySymbol = '₹' }) {
  return [
    customerName,
    order.orderNumber,
    String(order.tableNumber),
    formatCurrency(order.totalAmount, currencySymbol),
  ];
}

module.exports = {
  orderConfirmation,
  orderServed,
  renderCampaign,
  orderConfirmationTemplateVars,
  formatCurrency,
};
