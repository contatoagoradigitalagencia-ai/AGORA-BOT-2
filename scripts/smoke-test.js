import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { normalizeMetaWebhook } from '../src/providers/whatsapp/meta/normalize.js';
import { normalizeZapiWebhook } from '../src/providers/whatsapp/zapi/normalize.js';
import { hashPassword, normalizePhone } from '../src/services/auth/auth.service.js';
import { isWebhookPath } from '../src/config/cors.js';
import { buildAccountLookup } from '../src/services/ingestion/message-ingestion.service.js';

const meta = normalizeMetaWebhook({
  object: 'whatsapp_business_account',
  entry: [{ changes: [{ value: {
    messaging_product: 'whatsapp',
    metadata: { phone_number_id: '123', display_phone_number: '5511999999999' },
    contacts: [{ wa_id: '5511888888888', profile: { name: 'Cliente' } }],
    messages: [{ id: 'wamid.1', from: '5511888888888', timestamp: '1710000000', type: 'text', text: { body: 'Oi' } }],
  } }] }],
});
assert.equal(meta.length, 1);
assert.equal(meta[0].provider, 'meta');
assert.equal(meta[0].text, 'Oi');

const zapi = normalizeZapiWebhook({ instanceId: 'inst1', phone: '5511777777777', messageId: 'z1', text: { message: 'Olá' } });
assert.equal(zapi.length, 1);
assert.equal(zapi[0].provider, 'zapi');
assert.equal(zapi[0].text, 'Olá');

const zapiReceivedCallback = normalizeZapiWebhook({
  instanceId: '3F36F171852222FE9A0BCE87272212BE',
  type: 'ReceivedCallback',
  fromMe: false,
  status: 'RECEIVED',
  messageId: 'ACDBEC48A91586E38CC2C271EFAFD6F4',
  phone: '5521994778076',
  text: {
    message: 'Ola teste',
  },
});
assert.equal(zapiReceivedCallback.length, 1);
assert.equal(zapiReceivedCallback[0].event, 'message.received');
assert.equal(zapiReceivedCallback[0].direction, 'inbound');
assert.equal(zapiReceivedCallback[0].providerMessageId, 'ACDBEC48A91586E38CC2C271EFAFD6F4');
assert.equal(zapiReceivedCallback[0].from, '5521994778076');
assert.equal(zapiReceivedCallback[0].sender, '5521994778076');
assert.equal(zapiReceivedCallback[0].text, 'Ola teste');

const zapiLookup = buildAccountLookup({
  provider: 'zapi',
  accountExternalId: '3F36F171852222FE9A0BCE87272212BE',
});
assert.deepEqual(zapiLookup.query, {
  provider: 'zapi',
  $or: [
    { instanceId: '3F36F171852222FE9A0BCE87272212BE' },
    { externalId: '3F36F171852222FE9A0BCE87272212BE' },
  ],
});

assert.equal(normalizePhone('(21) 97110-7509'), '21971107509');
assert.equal(normalizePhone('5521971107509'), '5521971107509');

assert.equal(isWebhookPath('/webhook/zapi'), true);
assert.equal(isWebhookPath('/webhook/meta'), true);
assert.equal(isWebhookPath('/webhook'), true);
assert.equal(isWebhookPath('/login'), false);
assert.equal(isWebhookPath('/api/v1/contacts'), false);

const hash = await hashPassword('test-password');
assert.equal(await bcrypt.compare('test-password', hash), true);
assert.equal(await bcrypt.compare('wrong', hash), false);

console.log('Smoke tests OK.');
