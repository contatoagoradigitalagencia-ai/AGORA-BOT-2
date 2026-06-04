import axios from 'axios';
import { env } from '../../../config/env.js';
import { decryptSecret } from '../../../services/security/crypto.js';

function baseUrl(account, action) {
  const base = account.settings?.baseUrl || env.zapiBaseUrl;
  const instanceId = account.instanceId;
  const token = decryptSecret(account.accessTokenEncrypted);
  if (!instanceId || !token) throw new Error('Z-API instanceId/access token not configured');
  return `${base.replace(/\/$/, '')}/instances/${instanceId}/token/${token}/${action}`;
}

function headers(account) {
  const clientToken = decryptSecret(account.clientTokenEncrypted) || env.zapiClientToken;
  return clientToken ? { 'client-token': clientToken } : {};
}

async function post(account, action, payload) {
  const { data } = await axios.post(baseUrl(account, action), payload, {
    headers: headers(account),
    timeout: 30000,
  });
  return data;
}

export function createZapiProvider(account) {
  return {
    name: 'zapi',
    async sendText(to, text) {
      return post(account, 'send-text', { phone: to, message: text });
    },
    async sendImage(to, { link, caption }) {
      return post(account, 'send-image', { phone: to, image: link, caption });
    },
    async sendAudio(to, { link }) {
      return post(account, 'send-audio', { phone: to, audio: link });
    },
    async sendDocument(to, { link, filename }) {
      return post(account, 'send-document', { phone: to, document: link, fileName: filename });
    },
  };
}
