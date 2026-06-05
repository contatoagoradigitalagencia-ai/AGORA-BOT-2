function pickText(payload) {
  return payload.text?.message || payload.message?.text || payload.message || payload.body || '';
}

function pickType(payload) {
  if (payload.image || payload.imageUrl) return 'image';
  if (payload.audio || payload.audioUrl) return 'audio';
  if (payload.document || payload.documentUrl) return 'document';
  if (payload.video || payload.videoUrl) return 'video';
  if (payload.gif || payload.gifUrl) return 'video';
  if (payload.sticker || payload.stickerUrl) return 'sticker';
  if (payload.media || payload.mediaUrl || payload.fileUrl || payload.url) {
    const mimeType = String(payload.mimeType || payload.mimetype || payload.media?.mimeType || payload.media?.mimetype || '').toLowerCase();
    if (mimeType === 'image/gif') return 'video';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
  }
  if (payload.text || typeof payload.message === 'string' || payload.body) return 'text';
  return 'unknown';
}

function pickMedia(payload, type) {
  // Extrai URL de todos os possíveis formatos da Z-API
  function extractUrl(obj) {
    if (!obj) return null;
    if (typeof obj === 'string') return obj;
    return obj.url || obj.link || obj.mediaUrl || obj.fileUrl || obj.imageUrl
      || obj.thumbnailUrl || obj.audioUrl || obj.documentUrl || obj.videoUrl
      || obj.stickerUrl || obj.gifUrl || null;
  }

  function commonMedia(obj = {}) {
    return {
      providerUrl: extractUrl(obj) || extractUrl(payload.media) || extractUrl(payload),
      url: extractUrl(obj) || extractUrl(payload.media) || extractUrl(payload),
      link: obj.link || obj.url || extractUrl(payload.media) || extractUrl(payload),
      mimeType: obj.mimeType || obj.mimetype || payload.mimeType || payload.mimetype || payload.media?.mimeType || payload.media?.mimetype,
      fileName: obj.fileName || obj.filename || payload.fileName || payload.filename || payload.media?.fileName || payload.media?.filename || null,
      caption: obj.caption || payload.caption || payload.text?.message || payload.message?.text || '',
      thumbnailUrl: obj.thumbnailUrl || payload.thumbnailUrl || null,
    };
  }

  if (type === 'image') {
    const obj = payload.image || {};
    const media = commonMedia(obj);
    return {
      ...media,
      mimeType: media.mimeType || 'image/jpeg',
    };
  }
  if (type === 'audio') {
    const obj = payload.audio || {};
    const media = commonMedia(obj);
    return {
      ...media,
      mimeType: media.mimeType || 'audio/ogg',
      duration: obj.duration || obj.seconds || null,
      voice:    obj.voice === true,
    };
  }
  if (type === 'document') {
    const obj = payload.document || {};
    const media = commonMedia(obj);
    return {
      ...media,
      mimeType: media.mimeType || 'application/octet-stream',
      fileName: media.fileName || 'documento',
    };
  }
  if (type === 'video') {
    const obj = payload.video || payload.gif || {};
    const media = commonMedia(obj);
    const isGif = Boolean(obj.isGif || payload.isGif || payload.gif || payload.gifUrl || media.mimeType === 'image/gif');
    return {
      ...media,
      mimeType: media.mimeType || (isGif ? 'image/gif' : 'video/mp4'),
      duration: obj.duration || obj.seconds || payload.duration || null,
      isGif,
    };
  }
  if (type === 'sticker') {
    const obj = payload.sticker || {};
    const media = commonMedia(obj);
    return {
      ...media,
      mimeType: media.mimeType || 'image/webp',
    };
  }
  return {};
}

function debugZapiMediaPayload(payload, type) {
  if (process.env.MEDIA_DEBUG !== 'true' || !['image', 'video'].includes(type)) return;
  console.log('[ZAPI MEDIA RAW]', {
    type,
    messageId: payload.messageId || payload.id,
    phone: payload.phone || payload.from || payload.senderPhone,
    image: Boolean(payload.image || payload.imageUrl),
    video: Boolean(payload.video || payload.videoUrl),
    gif: Boolean(payload.gif || payload.gifUrl || payload.isGif),
    document: Boolean(payload.document || payload.documentUrl),
    audio: Boolean(payload.audio || payload.audioUrl),
    media: Boolean(payload.media || payload.mediaUrl || payload.fileUrl || payload.url),
    text: Boolean(payload.text || payload.message || payload.body),
    caption: Boolean(payload.caption || payload.image?.caption || payload.video?.caption || payload.text?.message),
    rawKeys: Object.keys(payload || {}),
  });
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
  debugZapiMediaPayload(payload, type);
  const media = pickMedia(payload, type);
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
    text: type === 'text' ? pickText(payload) : (media.caption || ''),
    media,
    // Grupo
    isGroup:       groupInfo.isGroup,
    groupId:       groupInfo.groupId,
    participantId: groupInfo.participantId,
    mentions:      groupInfo.mentions,
    raw: payload,
  }];
}
