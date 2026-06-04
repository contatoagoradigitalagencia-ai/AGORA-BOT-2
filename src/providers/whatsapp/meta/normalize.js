function parseMetaMessage(message, contact, metadata, rawValue) {
  const type = message.type || 'unknown';
  return {
    provider: 'meta',
    accountExternalId: metadata?.phone_number_id,
    phoneNumber: metadata?.display_phone_number,
    event: 'message.received',
    providerMessageId: message.id,
    from: message.from,
    contactName: contact?.profile?.name || '',
    timestamp: message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date(),
    direction: 'inbound',
    type,
    text: type === 'text' ? message.text?.body || '' : '',
    media: message[type] && type !== 'text' ? message[type] : {},
    raw: { message, value: rawValue },
  };
}

function parseMetaStatus(status, metadata, rawValue) {
  return {
    provider: 'meta',
    accountExternalId: metadata?.phone_number_id,
    phoneNumber: metadata?.display_phone_number,
    event: 'message.status',
    providerMessageId: status.id,
    recipient: status.recipient_id,
    status: status.status,
    timestamp: status.timestamp ? new Date(Number(status.timestamp) * 1000) : new Date(),
    raw: { status, value: rawValue },
  };
}

export function normalizeMetaWebhook(payload) {
  if (payload?.object !== 'whatsapp_business_account') return [];
  const events = [];
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      if (value.messaging_product && value.messaging_product !== 'whatsapp') continue;
      const metadata = value.metadata || {};
      const contactsByPhone = new Map((value.contacts || []).map((contact) => [contact.wa_id, contact]));
      for (const message of value.messages || []) {
        events.push(parseMetaMessage(message, contactsByPhone.get(message.from), metadata, value));
      }
      for (const status of value.statuses || []) {
        events.push(parseMetaStatus(status, metadata, value));
      }
    }
  }
  return events.filter((event) => event.accountExternalId);
}
