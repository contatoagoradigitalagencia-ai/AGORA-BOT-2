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


function pickGroupInfo(payload) {
  const phone   = payload.phone || payload.from || '';
  const isGroup = Boolean(payload.isGroup) || phone.endsWith('@g.us')
    || Boolean(payload.participantLid) || Boolean(payload.participant);

  const groupId      = isGroup ? phone : null;
  const participantId = payload.participant || payload.participantLid || payload.senderPhone || '';

  // Detecta menções: array mentions, mentionedJid, ou @numero no texto
  const mentions = payload.mentions || payload.mentionedJid || [];
  const textRaw  = payload.text?.message || payload.message?.text || payload.message || payload.body || '';
  const mentioned = Array.isArray(mentions) && mentions.length > 0
    ? mentions
    : (String(textRaw).includes('@') ? [String(textRaw)] : []);

  return { isGroup, groupId, participantId, mentions: mentioned };
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

  const groupInfo = pickGroupInfo(payload);
  return [{
    provider: 'zapi',
    accountExternalId: instanceId,
    event: 'message.received',
    providerMessageId: payload.messageId || payload.id || payload.chatId,
    from: groupInfo.isGroup ? (groupInfo.participantId || phone) : phone,
    sender: phone,
    contactName: payload.senderName || payload.name || '',
    timestamp: pickTimestamp(payload),
    direction: payload.fromMe ? 'outbound' : 'inbound',
    fromMe: Boolean(payload.fromMe),
    fromApi: Boolean(payload.fromApi),
    type,
    text: type === 'text' ? pickText(payload) : '',
    media: pickMedia(payload, type),
    // Grupo
    isGroup:       groupInfo.isGroup,
    groupId:       groupInfo.groupId,
    participantId: groupInfo.participantId,
    mentions:      groupInfo.mentions,
    raw: payload,
  }];
}
