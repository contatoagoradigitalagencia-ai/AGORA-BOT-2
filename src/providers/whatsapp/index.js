import { createMetaProvider } from './meta/provider.js';
import { createZapiProvider } from './zapi/provider.js';

export function getWhatsAppProvider(account) {
  if (!account?.provider) throw new Error('WhatsApp account provider is required');
  if (account.provider === 'meta') return createMetaProvider(account);
  if (account.provider === 'zapi') return createZapiProvider(account);
  throw new Error(`Unsupported WhatsApp provider: ${account.provider}`);
}

export { normalizeMetaWebhook } from './meta/normalize.js';
export { normalizeZapiWebhook } from './zapi/normalize.js';
