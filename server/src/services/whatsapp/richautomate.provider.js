'use strict';

const env = require('../../config/env');
const { normalizePhone } = require('../../lib/phone');

const richAutomateProvider = {
  name: 'richautomate',

  isConfigured() {
    const { apiKey, baseUrl } = env.whatsapp.richautomate;
    return Boolean(apiKey && baseUrl);
  },

  async request(path, payload) {
    const { apiKey, baseUrl } = env.whatsapp.richautomate;
    const url = `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const detail =
        data?.message ||
        data?.error?.message ||
        data?.error ||
        `HTTP ${response.status}`;

      throw new Error(`RichAutomate WhatsApp API error: ${detail}`);
    }
console.log('RichAutomate response:', JSON.stringify(data));
    return {
      providerMessageId:
        data?.messageId ||
        data?.message_id ||
        data?.id ||
        data?.messages?.[0]?.id ||
        '',
    };
  },

  async sendText({ to, body }) {
    const phone = normalizePhone(to);

    if (!phone) {
      throw new Error('Invalid customer phone number');
    }

    return this.request('/send-message', {
      phone,
      message: body,
    });
  },

  async sendTemplate({ to, templateName, variables = [], language }) {
    const phone = normalizePhone(to);

    if (!phone) {
      throw new Error('Invalid customer phone number');
    }

    const { templateLanguage } = env.whatsapp.richautomate;

    return this.request('/send-template', {
      phone,
      template: templateName,
      language: language || templateLanguage,
      variables: variables.map((value) => String(value)),
    });
  },
};

module.exports = richAutomateProvider;
