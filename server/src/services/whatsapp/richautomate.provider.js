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

  const { templateLanguage, apiKey, baseUrl } = env.whatsapp.richautomate;

  const result = await this.request('/send-template', {
    phone,
    template: templateName,
    language: language || templateLanguage,
    variables: variables.map((value) => String(value)),
  });

  // Temporary diagnostic: check WhatsApp delivery status
  if (result.providerMessageId) {
    try {
      const statusUrl =
        `${baseUrl.replace(/\/$/, '')}/message-status/${result.providerMessageId}`;

      await new Promise((resolve) => setTimeout(resolve, 3000));

      const statusResponse = await fetch(statusUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      const statusData = await statusResponse.json().catch(() => ({}));

      console.log(
        'RichAutomate message status:',
        JSON.stringify(statusData)
      );
    } catch (error) {
      console.error(
        'RichAutomate status check failed:',
        error.message
      );
    }
  }

  return result;
},

module.exports = richAutomateProvider;
