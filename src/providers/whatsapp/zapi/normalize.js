function pickText(payload) {
  return payload.text?.message || payload.message?.text || payload.message || payload.body || '';
}

function pickType(payload) {
  if (payload.text || typeof payload.message === 'string' || payload.body) return 'text';
  if (payload.image || payload.imageUrl) return 'image';
  if (payload.audio || payload.audioUrl) return 'audio';
  if (payload.document || payload.documentUrl) return 'document';
  if (payload.video || payload.videoUrl) return 'video';
  if (payload.sticker || payload.stickerUrl) return 'sticker';
  return 'unknown';
}

function pickMedia(payload, type) {
  // Extrai URL de todos os possíveis formatos da Z-API
  function extractUrl(obj) {
    return obj?.url || obj?.link || obj?.mediaUrl || obj?.imageUrl
      || obj?.audioUrl || obj?.documentUrl || obj?.videoUrl || obj?.stickerUrl || null;
  }

  if (type === 'image') {
    const obj = payload.image || {};
    return {
      url:      extractUrl(obj) || extractUrl(payload),
      link:     obj.link || payload.imageUrl || null,
      mimeType: obj.mimeType || obj.mimetype || 'image/jpeg',
      caption:  obj.caption || payload.caption || pickText(payload) || '',
      fileName: obj.fileName || obj.filename || null,
    };
  }
  if (type === 'audio') {
    const obj = payload.audio || {};
    return {
      url:      extractUrl(obj) || extractUrl(payload),
      link:     obj.link || payload.audioUrl || null,
      mimeType: obj.mimeType || obj.mimetype || 'audio/ogg',
      duration: obj.duration || obj.seconds || null,
      voice:    obj.voice === true,
      fileName: obj.fileName || obj.filename || null,
    };
  }
  if (type === 'document') {
    const obj = payload.document || {};
    return {
      url:      extractUrl(obj) || extractUrl(payload),
      link:     obj.link || payload.documentUrl || null,
      mimeType: obj.mimeType || obj.mimetype || 'application/octet-stream',
      fileName: obj.fileName || obj.filename || payload.fileName || 'documento',
      caption:  obj.caption || payload.caption || '',
    };
  }
  if (type === 'video') {
    const obj = payload.video || {};
    return {
      url:      extractUrl(obj) || extractUrl(payload),
      link:     obj.link || payload.videoUrl || null,
      mimeType: obj.mimeType || obj.mimetype || 'video/mp4',
      caption:  obj.caption || payload.caption || '',
      fileName: obj.fileName || obj.filename || null,
    };
  }
  if (type === 'sticker') {
    const obj = payload.sticker || {};
    return {
      url:      extractUrl(obj) || payload.stickerUrl || null,
      mimeType: obj.mimeType || 'image/webp',
    };
  }
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


// Tipos de eventos de sistema que nunca devem gerar resposta
const SYSTEM_EVENT_TYPES = new Set([
  'groupParticipantAdded',
  'groupParticipantRemoved',
  'groupParticipantLeft',
  'groupParticipantPromoted',
  'groupParticipantDemoted',
  'groupUpdated',
  'groupCreated',
  'groupDeleted',
  'groupSubjectUpdated',
  'groupDescriptionUpdated',
  'groupIconUpdated',
  'groupInviteLinkRevoked',
  'participantAdded',
  'participantRemoved',
  'participantLeft',
  'left',
  'add',
  'remove',
  'promote',
  'demote',
  'MessageStatusCallback',
  'ReadReceiptCallback',
  'DeliveryCallback',
  'statusCallback',
  'PresenceCallback',
  'call',
  'poll',
]);

function isSystemEvent(payload) {
  const type = String(payload.type || payload.event || payload.messageType || '');
  if (SYSTEM_EVENT_TYPES.has(type)) return true;
  // Newsletter — nunca responder
  if (payload.isNewsletter === true) return true;
  const phone = String(payload.phone || payload.from || '');
  if (phone.includes('@newsletter')) return true;
  // Z-API às vezes manda participantLid sem texto — é evento de grupo
  if (payload.participantLid && !payload.text?.message && !payload.message && !payload.body) return true;
  // Notificações de grupo sem conteúdo real
  if (payload.notification || payload.notificationType) return true;
  return false;
}

export function normalizeZapiWebhook(payload) {
  // Ignora eventos de sistema de grupo — saída, entrada, promoção, etc.
  if (isSystemEvent(payload)) {
    console.log('[Z-API] system event ignored:', payload.type || payload.event, payload.phone);
    return [];
  }

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
    text: type === 'text' ? pickText(payload) : (payload.image?.caption || payload.document?.caption || payload.video?.caption || payload.caption || ''),
    media: pickMedia(payload, type),
    // Grupo
    isGroup:       groupInfo.isGroup,
    groupId:       groupInfo.groupId,
    participantId: groupInfo.participantId,
    mentions:      groupInfo.mentions,
    raw: payload,
  }];
}
