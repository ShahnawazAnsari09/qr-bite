'use strict';

const env = require('../../config/env');

/**
 * Twilio WhatsApp provider. Uses Twilio's REST endpoint directly rather than
 * the SDK to keep the dependency footprint small — the request is a single
 * form-encoded POST.
 *
 * For development, Twilio's WhatsApp Sandbox lets any number receive messages
 * after it opts in by sending the sandbox join code, which avoids the full
 * business-verification process.
 */
const twilioProvider = {
  name: 'twilio',

  isConfigured() {
    const { accountSid, authToken, from } = env.whatsapp.twilio;
    return Boolean(accountSid && authToken && from);
  },

  async sendText({ to, body }) {
    const { accountSid, authToken, from } = env.whatsapp.twilio;
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

    const params = new URLSearchParams({
      To: `whatsapp:+${String(to).replace(/^\+/, '')}`,
      From: from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
      Body: body,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(`Twilio WhatsApp API error: ${data?.message || `HTTP ${response.status}`}`);
    }

    return { providerMessageId: data?.sid || '' };
  },

  /**
   * Twilio exposes content templates through a separate Content API. Rendering
   * the body locally and sending it as text is equivalent for sandbox and
   * within-window use, which is the configuration this project targets.
   */
  async sendTemplate({ to, body, templateName, variables = [] }) {
    const text = body || `${templateName}: ${variables.join(' | ')}`;
    return this.sendText({ to, body: text });
  },
};

module.exports = twilioProvider;
