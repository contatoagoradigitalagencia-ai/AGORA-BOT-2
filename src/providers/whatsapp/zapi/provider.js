import axios from 'axios';
import { env } from '../../../config/env.js';
import { decryptSecret } from '../../../services/security/crypto.js';

function readCredential(account, names) {
  for (const name of names) {
    const value = account.credentials?.[name] ?? account[name];
    if (value) return value;
  }
  return '';
}

function readSecret(account, plainNames, encryptedNames) {
  for (const name of encryptedNames) {
    const value = account.credentials?.[name] ?? account[name];
    const decrypted = decryptSecret(value);
    if (decrypted) return decrypted;
  }

  return readCredential(account, plainNames);
}

export function zapiCredentials(account) {
  const instanceId = readCredential(account, ['instanceId', 'externalId']);
  const token = readSecret(
    account,
    ['instanceToken', 'accessToken', 'token'],
    ['instanceTokenEncrypted', 'accessTokenEncrypted', 'tokenEncrypted'],
  );
  const clientToken = readSecret(
    account,
    ['clientToken'],
    ['clientTokenEncrypted'],
  ) || env.zapiClientToken;

  return {
    baseUrl: account.settings?.baseUrl || account.credentials?.baseUrl || env.zapiBaseUrl,
    instanceId,
    token,
    clientToken,
  };
}

function baseUrl(account, action) {
  const credentials = zapiCredentials(account);
  if (!credentials.instanceId || !credentials.token) {
    console.log('[ZAPI SEND]', {
      accountId: account?._id,
      credentials: account?.credentials,
      instanceId: account?.instanceId,
      externalId: account?.externalId,
    });
    throw new Error('Z-API instanceId/access token not configured');
  }
  return `${credentials.baseUrl.replace(/\/$/, '')}/instances/${credentials.instanceId}/token/${credentials.token}/${action}`;
}

function headers(account) {
  const { clientToken } = zapiCredentials(account);
  return clientToken ? { 'client-token': clientToken } : {};
}

async function post(account, action, payload) {
  const { data } = await axios.post(baseUrl(account, action), payload, {
    headers: headers(account),
    timeout: 30000,
  });
  return data;
}

async function get(account, action) {
  const { data } = await axios.get(baseUrl(account, action), {
    headers: headers(account),
    timeout: 15000,
  });
  return data;
}

function normalizeZapiStatus(raw) {
  const connected = !!(
    raw?.connected === true ||
    raw?.value === 'CONNECTED' ||
    ['connected', 'open', 'online', 'CONNECTED'].includes(raw?.value) ||
    ['connected', 'open', 'online'].includes(raw?.status)
  );
  return { connected, raw };
}

export function createZapiProvider(account) {
  return {
    name: 'zapi',
    async getStatus() {
      const raw = await get(account, 'status');
      return normalizeZapiStatus(raw);
    },
    async getQr() {
      const raw = await get(account, 'qr-code');
      const qr = raw?.value || raw?.qrCode || raw?.qrcode || raw?.qr || raw?.image || null;
      return { qr };
    },
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
