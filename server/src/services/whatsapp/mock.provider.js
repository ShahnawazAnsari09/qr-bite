'use strict';

const logger = require('../../lib/logger');
const { maskPhone } = require('../../lib/phone');

/**
 * Development / demo provider. Performs no network call, so the whole ordering
 * and campaign flow is demonstrable without a WhatsApp Business account — which
 * requires a verified business and an approved template review.
 *
 * Messages are still persisted by the caller, so the dashboard's message log
 * looks and behaves exactly as it would against a live provider.
 */
const mockProvider = {
  name: 'mock',

  isConfigured() {
    return true;
  },

  async sendText({ to, body }) {
    logger.info(`[whatsapp:mock] → ${maskPhone(to)}\n${body}\n`);
    return {
      providerMessageId: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
  },

  async sendTemplate({ to, templateName, variables }) {
    logger.info(
      `[whatsapp:mock] → ${maskPhone(to)} template=${templateName} vars=${JSON.stringify(variables)}`
    );
    return {
      providerMessageId: `mock-tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
  },
};

module.exports = mockProvider;
