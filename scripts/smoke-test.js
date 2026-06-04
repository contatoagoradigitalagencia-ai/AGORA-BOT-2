import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { normalizeMetaWebhook } from '../src/providers/whatsapp/meta/normalize.js';
import { normalizeZapiWebhook } from '../src/providers/whatsapp/zapi/normalize.js';
import { hashPassword, normalizePhone } from '../src/services/auth/auth.service.js';

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

assert.equal(normalizePhone('(21) 97110-7509'), '21971107509');
assert.equal(normalizePhone('5521971107509'), '5521971107509');

const hash = await hashPassword('test-password');
assert.equal(await bcrypt.compare('test-password', hash), true);
assert.equal(await bcrypt.compare('wrong', hash), false);

console.log('Smoke tests OK.');
