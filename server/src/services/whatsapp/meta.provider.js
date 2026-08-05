'use strict';

const env = require('../../config/env');

/**
 * WhatsApp Cloud API (Meta) provider.
 *
 * Note on messaging policy: free-form text only reaches a customer inside the
 * 24-hour customer-service window opened by their own last message. Because a
 * diner has usually never messaged the restaurant, order confirmations and
 * promotions should use an approved template — configure the template names in
 * .env. `sendText` remains available for replies inside an open window and for
 * test numbers.
 */
const metaProvider = {
  name: 'meta',

  isConfigured() {
    return Boolean(env.whatsapp.meta.phoneNumberId && env.whatsapp.meta.accessToken);
  },

  async request(payload) {
    const { phoneNumberId, accessToken, apiVersion } = env.whatsapp.meta;
    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const detail = data?.error?.message || `HTTP ${response.status}`;
      throw new Error(`Meta WhatsApp API error: ${detail}`);
    }

    return { providerMessageId: data?.messages?.[0]?.id || '' };
  },

  async sendText({ to, body }) {
    return this.request({
      to,
      type: 'text',
      text: { preview_url: false, body },
    });
  },

  async sendTemplate({ to, templateName, variables = [], language }) {
    return this.request({
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: language || env.whatsapp.meta.templateLanguage },
        components: variables.length
          ? [
              {
                type: 'body',
                parameters: variables.map((value) => ({ type: 'text', text: String(value) })),
              },
            ]
          : [],
      },
    });
  },
};

module.exports = metaProvider;
