import {
  WhatsAppAccount,
  Contact,
  Conversation,
  Message,
  HumanQueue,
  Metric,
  ErrorLog,
} from '../../models/index.js';
import { decryptSecret } from '../security/crypto.js';
import { getWhatsAppProvider } from '../../providers/whatsapp/index.js';
import { generateBotAnswer, getBotConfig, shouldSendToHuman } from '../bot/bot-response.service.js';
import { safeError, safeLog } from '../logging/logger.js';

export function buildAccountLookup(event) {
  const provider = event.provider;
  const accountExternalId = String(event.accountExternalId || '').trim();

  if (provider === 'meta') {
    return {
      provider,
      accountExternalId,
      query: { provider: 'meta', phoneNumberId: accountExternalId },
    };
  }

  if (provider === 'zapi') {
    return {
      provider,
      accountExternalId,
      query: {
        provider: 'zapi',
        $or: [
          { instanceId: accountExternalId },
          { externalId: accountExternalId },
        ],
      },
    };
  }

  return {
    provider,
    accountExternalId,
    query: { provider, externalId: accountExternalId },
  };
}

function eventStatus(event) {
  return String(event.status || event.raw?.status || event.raw?.messageStatus || '').toUpperCase();
}

export function shouldIgnoreEvent(event) {
  const rawType = String(event.raw?.type || event.type || '').toLowerCase();
  const status = eventStatus(event);
  const isStatusCallback = event.event === 'message.status' || rawType === 'messagestatuscallback';

  if (isStatusCallback) return { ignored: true, reason: 'status_event' };
  if (event.fromMe === true || event.raw?.fromMe === true) return { ignored: true, reason: 'from_me' };
  if (event.fromApi === true || event.raw?.fromApi === true) return { ignored: true, reason: 'from_api' };
  if (event.direction === 'outbound') return { ignored: true, reason: 'outbound' };
  if (event.event !== 'message.received' && ['SENT', 'RECEIVED', 'READ'].includes(status)) {
    return { ignored: true, reason: 'delivery_status' };
  }

  return { ignored: false, reason: '' };
}

export function isAutoReplyEnabled(account) {
  return account?.settings?.autoReply === true;
}

async function findAccount(event) {
  const { provider, accountExternalId, query } = buildAccountLookup(event);
  console.log({
    provider,
    accountExternalId,
    query,
    database: WhatsAppAccount.db?.name,
    collection: WhatsAppAccount.collection?.name,
  });
  console.dir(query, { depth: null });

  const account = await WhatsAppAccount.findOne(query).select('+accessTokenEncrypted +clientTokenEncrypted +credentials +webhookSecret +verifyToken');
  console.log('[Webhook] account lookup result', {
    found: Boolean(account),
    accountId: account?._id,
    instanceId: account?.instanceId,
    externalId: account?.externalId,
    status: account?.status,
  });
  return account;
}

async function findExistingMessage(account, event) {
  if (!event.providerMessageId) return null;
  return Message.findOne({
    whatsappAccountId: account._id,
    provider: event.provider,
    providerMessageId: event.providerMessageId,
  }).lean();
}

async function upsertContact(account, event) {
  const filter = { organizationId: account.organizationId, whatsappAccountId: account._id, phone: event.from };
  const update = {
    $set: {
      name: event.contactName || undefined,
      lastMessageAt: event.timestamp || new Date(),
      metadata: { provider: event.provider },
    },
    $setOnInsert: {
      organizationId: account.organizationId,
      whatsappAccountId: account._id,
      phone: event.from,
    },
  };
  console.log('[Ingestion] before contact upsert', {
    event,
    filter,
    update,
    database: Contact.db?.name,
    collection: Contact.collection?.name,
  });
  const contact = await Contact.findOneAndUpdate(filter, update, { new: true, upsert: true });
  console.log('[Ingestion] after contact upsert', {
    event,
    contactId: contact?._id,
    phone: contact?.phone,
  });
  return contact;
}

async function upsertConversation(account, contact, event) {
  const filter = { organizationId: account.organizationId, whatsappAccountId: account._id, contactId: contact._id };
  const update = {
    $set: {
      lastMessageAt: event.timestamp || new Date(),
      lastMessagePreview: event.text || `[${event.type}]`,
    },
    $inc: { unreadCount: event.direction === 'inbound' ? 1 : 0 },
    $setOnInsert: {
      organizationId: account.organizationId,
      whatsappAccountId: account._id,
      contactId: contact._id,
      status: 'open',
      aiEnabled: true,
    },
  };
  console.log('[Ingestion] before conversation upsert', {
    event,
    contactId: contact?._id,
    filter,
    update,
    database: Conversation.db?.name,
    collection: Conversation.collection?.name,
  });
  const conversation = await Conversation.findOneAndUpdate(filter, update, { new: true, upsert: true });
  console.log('[Ingestion] after conversation upsert', {
    event,
    contactId: contact?._id,
    conversationId: conversation?._id,
    status: conversation?.status,
  });
  return conversation;
}

async function saveMessage(account, contact, conversation, event, extra = {}) {
  const filter = {
    whatsappAccountId: account._id,
    provider: event.provider,
    providerMessageId: event.providerMessageId,
  };
  const update = {
    $setOnInsert: {
      organizationId: account.organizationId,
      whatsappAccountId: account._id,
      contactId: contact._id,
      conversationId: conversation._id,
      provider: event.provider,
      providerMessageId: event.providerMessageId,
      direction: event.direction || 'inbound',
      type: event.type || 'unknown',
      text: event.text || '',
      media: event.media || {},
      status: event.status || 'received',
      raw: event.raw || {},
      occurredAt: event.timestamp || new Date(),
      ...extra,
    },
  };
  console.log('[Ingestion] before message upsert', {
    event,
    contactId: contact?._id,
    conversationId: conversation?._id,
    filter,
    update,
    database: Message.db?.name,
    collection: Message.collection?.name,
  });
  const message = await Message.findOneAndUpdate(filter, update, { new: true, upsert: true });
  console.log('[Ingestion] after message upsert', {
    event,
    contactId: contact?._id,
    conversationId: conversation?._id,
    messageId: message?._id,
    providerMessageId: message?.providerMessageId,
    direction: message?.direction,
  });
  return message;
}

async function enqueueHuman(account, contact, conversation, reason) {
  await Conversation.updateOne({ _id: conversation._id }, { humanRequired: true, status: 'pending_human' });
  await HumanQueue.findOneAndUpdate(
    { organizationId: account.organizationId, conversationId: conversation._id, status: { $in: ['waiting', 'assigned'] } },
    {
      $setOnInsert: {
        organizationId: account.organizationId,
        conversationId: conversation._id,
        contactId: contact._id,
        reason,
        status: 'waiting',
      },
    },
    { upsert: true, new: true },
  );
}

async function persistMetric(organizationId, name, dimensions = {}) {
  await Metric.create({ organizationId, name, dimensions, value: 1 });
}

export async function processNormalizedEvent(event, io) {
  console.log('[Ingestion] normalized event received', {
    event,
    normalizedEvent: event,
  });
  const account = await findAccount(event);
  if (!account) {
    safeLog('[Webhook] account not found', { provider: event.provider, accountExternalId: event.accountExternalId });
    return { ignored: true, reason: 'account_not_found' };
  }

  const ignore = shouldIgnoreEvent(event);
  if (ignore.ignored) {
    console.log('[Ingestion] event ignored before persistence', {
      event,
      reason: ignore.reason,
      direction: event.direction,
      status: eventStatus(event),
    });
    return { ok: true, ignored: true, reason: ignore.reason };
  }

  const existingMessage = await findExistingMessage(account, event);
  if (existingMessage) {
    console.log('[Ingestion] duplicate providerMessageId ignored', {
      event,
      messageId: existingMessage._id,
      providerMessageId: event.providerMessageId,
      aiGenerated: existingMessage.aiGenerated,
    });
    return {
      ok: true,
      duplicate: true,
      messageId: existingMessage._id,
      providerMessageId: event.providerMessageId,
    };
  }

  try {
    console.log('[Ingestion] persistence flow start', {
      event,
      accountId: account?._id,
      organizationId: account?.organizationId,
      whatsappAccountId: account?._id,
    });
    const contact = await upsertContact(account, event);
    const conversation = await upsertConversation(account, contact, event);
    const inbound = await saveMessage(account, contact, conversation, event);
    console.log('[Ingestion] persistence flow complete', {
      event,
      contactId: contact?._id,
      conversationId: conversation?._id,
      messageId: inbound?._id,
    });
    await persistMetric(account.organizationId, 'message.received', { provider: event.provider, type: event.type });

    io?.to(String(account.organizationId)).emit('message:received', { conversationId: conversation._id, messageId: inbound._id });

    if (!isAutoReplyEnabled(account)) {
      console.log('[Ingestion] autoReply paused, message saved without AI response', {
        event,
        accountId: account?._id,
        contactId: contact?._id,
        conversationId: conversation?._id,
        messageId: inbound?._id,
        autoReply: account?.settings?.autoReply,
      });
      return {
        ok: true,
        paused: true,
        contactId: contact._id,
        conversationId: conversation._id,
        messageId: inbound._id,
      };
    }

    const config = await getBotConfig(account.organizationId, account._id);
    if (shouldSendToHuman(event.text, config)) {
      await enqueueHuman(account, contact, conversation, 'keyword');
      return { ok: true, human: true };
    }

    if (conversation.humanRequired || conversation.aiEnabled === false) return { ok: true, ai: false };

    const answer = await generateBotAnswer({
      organizationId: account.organizationId,
      whatsappAccountId: account._id,
      conversation,
      latestText: event.text || `[${event.type}]`,
    });

    if (!answer) return { ok: true, ai: false };

    const provider = getWhatsAppProvider({
      ...account.toObject(),
      accessTokenEncrypted: account.accessTokenEncrypted,
      clientTokenEncrypted: account.clientTokenEncrypted,
      credentials: account.credentials,
    });
    const result = await provider.sendText(event.from, answer);
    const providerMessageId = result?.messages?.[0]?.id || result?.messageId || result?.id || `local-${Date.now()}`;
    await saveMessage(account, contact, conversation, {
      provider: event.provider,
      providerMessageId,
      direction: 'outbound',
      type: 'text',
      text: answer,
      status: 'sent',
      timestamp: new Date(),
      raw: result,
    }, { aiGenerated: true });
    await persistMetric(account.organizationId, 'message.sent', { provider: event.provider, ai: true });
    return { ok: true, ai: true };
  } catch (error) {
    console.log('[Ingestion] exception', {
      event,
      normalizedEvent: event,
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : undefined,
      stack: error instanceof Error ? error.stack : undefined,
      contactId: error?.contactId,
      conversationId: error?.conversationId,
      messageId: error?.messageId,
    });
    safeError('[Ingestion] failed', error, { provider: event.provider, accountExternalId: event.accountExternalId });
    await ErrorLog.create({
      organizationId: account.organizationId,
      source: 'message-ingestion',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : '',
      context: { provider: event.provider, accountExternalId: event.accountExternalId },
    });
    throw error;
  }
}
