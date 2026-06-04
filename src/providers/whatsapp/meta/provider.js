import axios from 'axios';
import { env } from '../../../config/env.js';
import { decryptSecret } from '../../../services/security/crypto.js';

function graphUrl(account, suffix = 'messages') {
  const version = account.settings?.graphVersion || env.metaGraphVersion;
  return `https://graph.facebook.com/${version}/${account.phoneNumberId}/${suffix}`;
}

async function send(account, payload) {
  const token = decryptSecret(account.accessTokenEncrypted);
  if (!token) throw new Error('Meta access token not configured');
  const { data } = await axios.post(graphUrl(account), payload, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 30000,
  });
  return data;
}

export function createMetaProvider(account) {
  return {
    name: 'meta',
    async sendText(to, text) {
      return send(account, {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      });
    },
    async sendImage(to, { link, caption }) {
      return send(account, {
        messaging_product: 'whatsapp',
        to,
        type: 'image',
        image: { link, caption },
      });
    },
    async sendAudio(to, { link }) {
      return send(account, {
        messaging_product: 'whatsapp',
        to,
        type: 'audio',
        audio: { link },
      });
    },
    async sendDocument(to, { link, filename, caption }) {
      return send(account, {
        messaging_product: 'whatsapp',
        to,
        type: 'document',
        document: { link, filename, caption },
      });
    },
  };
}
