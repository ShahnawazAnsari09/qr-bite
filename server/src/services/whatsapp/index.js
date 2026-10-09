'use strict';

const env = require('../../config/env');
const logger = require('../../lib/logger');
const { maskPhone } = require('../../lib/phone');
const WhatsAppMessage = require('../../models/WhatsAppMessage');
const { MESSAGE_TYPE, DELIVERY_STATUS } = require('../../models/WhatsAppMessage');
const templates = require('./templates');

const providers = {
  mock: require('./mock.provider'),
  meta: require('./meta.provider'),
  twilio: require('./twilio.provider'),
   richautomate: require('./richautomate.provider'),
};

/**
 * Resolves the configured provider, falling back to the mock transport if
 * credentials are absent. Failing over rather than throwing keeps ordering
 * working when messaging is misconfigured — a diner should never be blocked
 * from eating because an API key expired.
 */
function getProvider() {
  const selected = providers[env.whatsapp.provider] || providers.mock;
  if (!selected.isConfigured()) {
    if (env.whatsapp.provider !== 'mock') {
      logger.warn(
        `WhatsApp provider "${env.whatsapp.provider}" is not fully configured; falling back to mock transport.`
      );
    }
    return providers.mock;
  }
  return selected;
}

/**
 * Sends one message and records the attempt. Never throws: the returned record
 * carries SENT / FAILED / SKIPPED so callers can report per-customer outcomes
 * (UC12 alternative course — flag the failure, continue the batch).
 */
async function dispatch({
  restaurantId,
  customer,
  order = null,
  type,
  body,
  templateName = '',
  templateVars = [],
  sentBy = null,
  campaignId = null,
}) {
  const provider = getProvider();
  const phone = customer.phone;

  const record = new WhatsAppMessage({
    restaurant: restaurantId,
    customer: customer._id,
    order: order ? order._id : undefined,
    type,
    content: body,
    provider: provider.name,
    maskedPhone: maskPhone(phone),
    sentBy: sentBy || undefined,
    campaignId: campaignId || undefined,
    deliveryStatus: DELIVERY_STATUS.QUEUED,
  });

  if (!phone) {
    record.deliveryStatus = DELIVERY_STATUS.SKIPPED;
    record.error = 'Customer has no usable phone number';
    await record.save();
    return record;
  }

  try {
    const result = templateName
      ? await provider.sendTemplate({ to: phone, templateName, variables: templateVars, body })
      : await provider.sendText({ to: phone, body });

    record.deliveryStatus = DELIVERY_STATUS.SENT;
    record.providerMessageId = result.providerMessageId || '';
    record.sentAt = new Date();
  } catch (err) {
    record.deliveryStatus = DELIVERY_STATUS.FAILED;
    record.error = err.message.slice(0, 500);
    logger.error(`WhatsApp send failed for ${maskPhone(phone)}: ${err.message}`);
  }

  await record.save();
  return record;
}

/** RQ8 / TC7 — fired automatically once an order is created. */
async function sendOrderConfirmation({ restaurant, customer, order }) {
  const body = templates.orderConfirmation({
    customerName: customer.name,
    restaurantName: restaurant.name,
    order,
    currencySymbol: restaurant.currencySymbol,
  });

  return dispatch({
    restaurantId: restaurant._id,
    customer,
    order,
    type: MESSAGE_TYPE.ORDER_CONFIRMATION,
    body,
    templateName:
  env.whatsapp.provider === 'richautomate'
    ? env.whatsapp.richautomate.templateOrderConfirmation
    : env.whatsapp.meta.templateOrderConfirmation,
    templateVars: templates.orderConfirmationTemplateVars({
      customerName: customer.name,
      order,
      currencySymbol: restaurant.currencySymbol,
    }),
  });
}

/** Thank-you note triggered when staff mark the order Served. */
async function sendOrderServed({ restaurant, customer, order }) {
  const body = templates.orderServed({
    customerName: customer.name,
    restaurantName: restaurant.name,
    order,
  });

  return dispatch({
  restaurantId: restaurant._id,
  customer,
  order,
  type: MESSAGE_TYPE.ORDER_SERVED,
  body,
  templateName:
    env.whatsapp.provider === 'richautomate'
      ? env.whatsapp.richautomate.templateOrderServed
      : env.whatsapp.meta.templateOrderServed,
  templateVars: [
    customer.name || 'there',
    order.orderNumber,
  ],
});
}

/**
 * UC12 — admin broadcast. Runs in small concurrent batches so a large customer
 * list neither serialises to a crawl nor floods the provider's rate limit.
 */
async function sendCampaign({ restaurant, customers, body, type, sentBy, campaignId, batchSize = 5 }) {
  const results = [];

  for (let i = 0; i < customers.length; i += batchSize) {
    const batch = customers.slice(i, i + batchSize);
    // eslint-disable-next-line no-await-in-loop
    const settled = await Promise.all(
      batch.map((customer) =>
        dispatch({
          restaurantId: restaurant._id,
          customer,
          type,
          body: templates.renderCampaign({
            body,
            customerName: customer.name,
            restaurantName: restaurant.name,
          }),
         templateName:
  type === MESSAGE_TYPE.PROMOTION
    ? env.whatsapp.provider === 'richautomate'
      ? env.whatsapp.richautomate.templatePromotion
      : env.whatsapp.meta.templatePromotion
    : '',
templateVars:
  type === MESSAGE_TYPE.PROMOTION
    ? [customer.name || 'there', body]
    : [],
          sentBy,
          campaignId,
        })
      )
    );
    results.push(...settled);
  }

  return results;
}

module.exports = {
  getProvider,
  dispatch,
  sendOrderConfirmation,
  sendOrderServed,
  sendCampaign,
  MESSAGE_TYPE,
  DELIVERY_STATUS,
};
