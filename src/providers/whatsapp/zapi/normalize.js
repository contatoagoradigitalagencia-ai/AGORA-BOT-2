function pickText(payload) {
  return payload.text?.message || payload.message?.text || payload.message || payload.body || '';
}

function pickType(payload) {
  if (payload.text || typeof payload.message === 'string' || payload.body) return 'text';
  if (payload.image || payload.imageUrl) return 'image';
  if (payload.audio || payload.audioUrl) return 'audio';
  if (payload.document || payload.documentUrl) return 'document';
  if (payload.video || payload.videoUrl) return 'video';
  return 'unknown';
}

function pickMedia(payload, type) {
  if (type === 'image') return payload.image || { link: payload.imageUrl };
  if (type === 'audio') return payload.audio || { link: payload.audioUrl };
  if (type === 'document') return payload.document || { link: payload.documentUrl, filename: payload.fileName };
  if (type === 'video') return payload.video || { link: payload.videoUrl };
  return {};
}

function pickTimestamp(payload) {
  return payload.momment || payload.moment || payload.timestamp || payload.createdAt
    ? new Date(payload.momment || payload.moment || payload.timestamp || payload.createdAt)
    : new Date();
}

function isReceivedInboundCallback(payload) {
  return String(payload.type || '').toLowerCase() === 'receivedcallback' && payload.fromMe === false;
}

function hasMessageContent(payload) {
  return pickType(payload) !== 'unknown';
}

export function normalizeZapiWebhook(payload) {
  const phone = payload.phone || payload.from || payload.senderPhone;
  const instanceId = payload.instanceId || payload.instance || payload.sessionId || payload.externalId;
  if (!phone || !instanceId) return [];

  const type = pickType(payload);
  const shouldTreatAsInboundMessage = isReceivedInboundCallback(payload) || (payload.fromMe === false && hasMessageContent(payload));

  if (!shouldTreatAsInboundMessage && (payload.status || payload.messageStatus)) {
    return [{
      provider: 'zapi',
      accountExternalId: instanceId,
      event: 'message.status',
      providerMessageId: payload.messageId || payload.id,
      recipient: phone,
      status: payload.status || payload.messageStatus,
      timestamp: pickTimestamp(payload),
      raw: payload,
    }];
  }

  return [{
    provider: 'zapi',
    accountExternalId: instanceId,
    event: 'message.received',
    providerMessageId: payload.messageId || payload.id || payload.chatId,
    from: phone,
    sender: phone,
    contactName: payload.senderName || payload.name || '',
    timestamp: pickTimestamp(payload),
    direction: payload.fromMe ? 'outbound' : 'inbound',
    type,
    text: type === 'text' ? pickText(payload) : '',
    media: pickMedia(payload, type),
    raw: payload,
  }];
}
