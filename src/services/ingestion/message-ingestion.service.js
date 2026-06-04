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

async function findAccount(event) {
  const query = event.provider === 'meta'
    ? { provider: 'meta', phoneNumberId: event.accountExternalId }
    : { provider: 'zapi', instanceId: event.accountExternalId };
  return WhatsAppAccount.findOne(query).select('+accessTokenEncrypted +clientTokenEncrypted +webhookSecret +verifyToken');
}

async function upsertContact(account, event) {
  return Contact.findOneAndUpdate(
    { organizationId: account.organizationId, whatsappAccountId: account._id, phone: event.from },
    {
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
    },
    { new: true, upsert: true },
  );
}

async function upsertConversation(account, contact, event) {
  return Conversation.findOneAndUpdate(
    { organizationId: account.organizationId, whatsappAccountId: account._id, contactId: contact._id },
    {
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
    },
    { new: true, upsert: true },
  );
}

async function saveMessage(account, contact, conversation, event, extra = {}) {
  return Message.findOneAndUpdate(
    { provider: event.provider, providerMessageId: event.providerMessageId },
    {
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
    },
    { new: true, upsert: true },
  );
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
  const account = await findAccount(event);
  if (!account) {
    safeLog('[Webhook] account not found', { provider: event.provider, accountExternalId: event.accountExternalId });
    return { ignored: true, reason: 'account_not_found' };
  }

  if (event.event === 'message.status') {
    await Message.updateOne(
      { provider: event.provider, providerMessageId: event.providerMessageId },
      { status: event.status || 'delivered', raw: event.raw || {} },
    );
    await persistMetric(account.organizationId, 'message.status', { provider: event.provider, status: event.status });
    return { ok: true, type: 'status' };
  }

  if (event.direction !== 'inbound') return { ignored: true, reason: 'not_inbound' };

  try {
    const contact = await upsertContact(account, event);
    const conversation = await upsertConversation(account, contact, event);
    const inbound = await saveMessage(account, contact, conversation, event);
    await persistMetric(account.organizationId, 'message.received', { provider: event.provider, type: event.type });

    io?.to(String(account.organizationId)).emit('message:received', { conversationId: conversation._id, messageId: inbound._id });

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

    const provider = getWhatsAppProvider({ ...account.toObject(), accessTokenEncrypted: account.accessTokenEncrypted, clientTokenEncrypted: account.clientTokenEncrypted });
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
