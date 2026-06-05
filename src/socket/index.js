import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { WhatsAppAccount, Contact, Conversation, Message, QuickReply, HumanQueue } from '../models/index.js';
import { canSendFreeformMessage } from '../services/messaging/send-window.js';
import mongoose from 'mongoose';

function toObjId(id) {
  try { return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id; }
  catch { return id; }
}

/**
 * Normaliza mensagem do banco para o formato que o frontend espera.
 * Frontend legado espera: { wamid, direction, timestamp, status, data: { type, text: { body } } }
 */
function normalizeMessage(msg, contact) {
  const id = String(msg._id);
  return {
    // campos de identidade
    wamid:       msg.providerMessageId || id,
    _id:         id,
    id,
    // remetente
    phone:       contact?.phone || '',
    name:        contact?.name  || contact?.phone || '',
    // direção e tempo
    direction:   msg.direction  || 'inbound',
    timestamp:   msg.occurredAt || msg.createdAt,
    status:      msg.status     || 'received',
    aiGenerated: msg.aiGenerated || false,
    // reply
    replyToMessageId: msg.replyToMessageId || null,
    replyToPreview:   msg.replyToPreview   || null,
    // data — formato que o frontend usa para renderizar
    data: {
      type: msg.type || 'text',
      text: { body: msg.text || '' },
      // outros tipos de mídia ficam no objeto media
      ...(msg.media && Object.keys(msg.media).length > 0 ? msg.media : {}),
    },
  };
}

export function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: env.corsOrigins, credentials: true },
  });

  io.on('connection', (socket) => {
    const rawOrgId = socket.handshake.auth?.organizationId
      || socket.handshake.query?.organizationId
      || socket.handshake.auth?.idPhone
      || socket.handshake.query?.idPhone;

    const organizationId = rawOrgId;
    if (organizationId) socket.join(String(organizationId));
    socket.emit('connected', { service: 'agora-bot-2' });

    // ── chat:load_messages ────────────────────────────────────────────────────
    socket.on('chat:load_messages', async ({ phone, beforeId } = {}, callback) => {
      if (typeof callback !== 'function') return;
      try {
        if (!phone) return callback({ error: 'phone required' });

        // Normaliza phone — remove sufixo -group e não-dígitos
        const isGroup = String(phone).includes('-group') || String(phone).includes('@g.us');
        const normalizedPhone = String(phone).replace(/-group$/i, '').replace(/@g\.us$/i, '');

        const contact = await Contact.findOne({ phone: normalizedPhone.replace(/\D/g, '') }).lean()
          || await Contact.findOne({ phone: normalizedPhone }).lean()
          || await Contact.findOne({ phone }).lean();

        if (!contact) return callback({ messages: [], hasMore: false, nextCursor: null });

        const conversation = await Conversation.findOne({ contactId: contact._id }).lean();
        if (!conversation) return callback({ messages: [], hasMore: false, nextCursor: null });

        const PAGE = 40;
        const filter = { conversationId: conversation._id };
        if (beforeId && mongoose.Types.ObjectId.isValid(beforeId)) {
          filter._id = { $lt: new mongoose.Types.ObjectId(beforeId) };
        }

        const msgs = await Message.find(filter)
          .sort({ occurredAt: -1 })
          .limit(PAGE + 1)
          .lean();

        const hasMore = msgs.length > PAGE;
        const page = hasMore ? msgs.slice(0, PAGE) : msgs;
        page.reverse(); // cronológico

        const normalized = page.map(m => normalizeMessage(m, contact));
        const nextCursor = hasMore ? String(page[0]._id) : null;

        callback({ messages: normalized, hasMore, nextCursor });
      } catch (err) {
        console.error('[Socket] chat:load_messages error', err.message);
        callback({ error: err.message });
      }
    });

    // ── chat:info_contact ─────────────────────────────────────────────────────
    socket.on('chat:info_contact', async ({ phone } = {}, callback) => {
      if (typeof callback !== 'function') return;
      try {
        if (!phone) return callback(null);
        const normalizedPhone = String(phone).replace(/-group$/i, '').replace(/@g\.us$/i, '');
        const contact = await Contact.findOne({ phone: normalizedPhone.replace(/\D/g, '') }).lean()
          || await Contact.findOne({ phone: normalizedPhone }).lean()
          || await Contact.findOne({ phone }).lean();

        if (!contact) return callback(null);

        const conversation = await Conversation.findOne({ contactId: contact._id }).lean();

        callback({
          _id:          String(contact._id),
          phone:        contact.phone,
          name:         contact.name || contact.phone,
          lastMessageAt: contact.lastMessageAt,
          assignedToName: conversation?.assignedToName || conversation?.metadata?.assignedToName || null,
          humanRequired:  conversation?.humanRequired  || false,
          conversationId: conversation ? String(conversation._id) : null,
        });
      } catch (err) {
        console.error('[Socket] chat:info_contact error', err.message);
        callback(null);
      }
    });

    // ── chat:reply_window ─────────────────────────────────────────────────────
    socket.on('chat:reply_window', async ({ phone } = {}, callback) => {
      if (typeof callback !== 'function') return;
      try {
        if (!phone) return callback({ allowed: true, reason: 'no_phone' });

        const account = await WhatsAppAccount.findOne({ status: 'active' })
          .sort({ createdAt: 1 }).select('provider').lean();

        // Z-API: sempre permitido
        if (!account || account.provider !== 'meta') {
          return callback({ allowed: true, reason: 'zapi_no_24h_window', provider: account?.provider || 'zapi' });
        }

        const normalizedPhone = String(phone).replace(/-group$/i, '').replace(/@g\.us$/i, '');
        const contact = await Contact.findOne({
          $or: [{ phone: normalizedPhone }, { phone: normalizedPhone.replace(/\D/g, '') }]
        }).select('_id').lean();

        if (!contact) return callback({ allowed: true, reason: 'contact_not_found', provider: 'meta' });

        const windowCheck = await canSendFreeformMessage({
          provider:       'meta',
          conversationId: (await Conversation.findOne({ contactId: contact._id }).select('_id').lean())?._id,
          Message,
        });

        callback({ ...windowCheck, provider: 'meta' });
      } catch (err) {
        console.error('[Socket] chat:reply_window error', err.message);
        callback({ allowed: true, reason: 'error_fail_open' });
      }
    });

    // ── chats:update_human_viewed ────────────────────────────────────────────
    socket.on('chats:update_human_viewed', async ({ phone } = {}, callback) => {
      if (typeof callback !== 'function') return callback?.(204);
      try {
        const contact = await Contact.findOne({ phone }).lean();
        if (contact) {
          await Conversation.updateOne({ contactId: contact._id }, { $set: { unreadCount: 0 } });
        }
        callback(204);
      } catch {
        callback(500);
      }
    });

    // ── chat:send_message — envio manual de texto ────────────────────────────
    socket.on('chat:send_message', async ({ phone, message } = {}, callback) => {
      if (typeof callback !== 'function') return;
      try {
        if (!phone || !message) return callback(400);

        const contact = await Contact.findOne({ phone: String(phone).replace(/\D/g, '') }).lean()
          || await Contact.findOne({ phone }).lean();
        if (!contact) return callback({ error: 'Contact not found' });

        const conversation = await Conversation.findOne({ contactId: contact._id }).lean();
        if (!conversation) return callback({ error: 'Conversation not found' });

        const account = await WhatsAppAccount.findById(conversation.whatsappAccountId)
          .select('+accessTokenEncrypted +clientTokenEncrypted +credentials');
        if (!account) return callback({ error: 'Account not found' });

        const text = message?.text?.body || message?.body || (typeof message === 'string' ? message : '');
        if (!text.trim()) return callback(400);

        // Verifica janela de envio (Z-API: livre / Meta: 24h)
        const windowCheck = await canSendFreeformMessage({
          provider:       account.provider,
          conversationId: conversation._id,
          Message,
        });
        if (!windowCheck.allowed) {
          return callback({ error: 'window_expired', reason: windowCheck.reason, requiresTemplate: windowCheck.requiresTemplate });
        }

        const { getWhatsAppProvider } = await import('../providers/whatsapp/index.js');
        const provider = getWhatsAppProvider(account.toObject());
        const result = await provider.sendText(contact.phone, text);
        const providerMessageId = result?.messages?.[0]?.id || result?.messageId || result?.id || ('manual-' + Date.now());

        const msg = await Message.create({
          organizationId:    conversation.organizationId,
          whatsappAccountId: account._id,
          contactId:         contact._id,
          conversationId:    conversation._id,
          provider:          account.provider,
          providerMessageId,
          direction:         'outbound',
          type:              'text',
          text:              text.trim(),
          status:            'sent',
          aiGenerated:       false,
          occurredAt:        new Date(),
          source:            'human',
          raw:               result || {},
        });

        await Conversation.updateOne(
          { _id: conversation._id },
          { $set: { lastMessageAt: new Date(), lastMessagePreview: text.slice(0, 80) } }
        );

        // Broadcast em tempo real
        if (io.broadcastMessage) io.broadcastMessage(conversation.organizationId, contact.phone, msg, contact);

        callback(204);
      } catch (err) {
        console.error('[Socket] chat:send_message error', err.message);
        callback({ error: err.message });
      }
    });

    // ── chat:on_off — liga/desliga IA por contato ───────────────────────────
    socket.on('chat:on_off', async ({ phone, stateBot } = {}, callback) => {
      if (typeof callback !== 'function') return;
      try {
        const contact = await Contact.findOne({ phone }).lean();
        if (!contact) return callback({ error: 'Contact not found' });
        await Conversation.updateOne(
          { contactId: contact._id },
          { $set: { aiEnabled: Boolean(stateBot) } }
        );
        callback(204);
      } catch (err) {
        callback({ error: err.message });
      }
    });

    // ── contacts:save_comment — salva observação do contato ─────────────────
    socket.on('contacts:save_comment', async ({ phone, comment } = {}, callback) => {
      if (typeof callback !== 'function') return;
      try {
        await Contact.updateOne({ phone }, { $set: { 'metadata.comment': comment } });
        callback(204);
      } catch (err) {
        callback({ error: err.message });
      }
    });

    // ── quick-messages — CRUD de mensagens rápidas ───────────────────────────
    socket.on('quick-messages:get_quick_messages', async ({ type } = {}, callback) => {
      if (typeof callback !== 'function') return;
      try {
        const filter = organizationId ? { organizationId: toObjId(organizationId) } : {};
        if (type) filter.type = type;
        const data = await QuickReply.find(filter).sort({ name: 1 }).lean();
        callback({ quickMessages: data });
      } catch (err) { callback({ error: err.message }); }
    });

    socket.on('quick-messages:save_quick_message', async ({ id, name, message, type } = {}, callback) => {
      if (typeof callback !== 'function') return;
      try {
        if (id) {
          await QuickReply.findByIdAndUpdate(id, { $set: { name, message, type } });
        } else {
          await QuickReply.create({ organizationId: toObjId(organizationId), name, message, type: type || 'text' });
        }
        callback(204);
      } catch (err) { callback({ error: err.message }); }
    });

    socket.on('quick-messages:delete_quick_message', async ({ id } = {}, callback) => {
      if (typeof callback !== 'function') return;
      try {
        await QuickReply.findByIdAndDelete(id);
        callback(204);
      } catch (err) { callback({ error: err.message }); }
    });

    // ── support:get_info_support ─────────────────────────────────────────────
    socket.on('support:get_info_support', async ({} = {}, callback) => {
      if (typeof callback !== 'function') return;
      callback({ status: 'operational', version: '2.0.0' });
    });

    // ── human-service:remove_waiting_service ────────────────────────────────
    socket.on('human-service:remove_waiting_service', async ({ phone } = {}, callback) => {
      if (typeof callback !== 'function') return;
      try {
        const contact = await Contact.findOne({ phone }).lean();
        if (contact) {
          await HumanQueue.updateMany(
            { contactId: contact._id, status: { $in: ['waiting', 'assigned'] } },
            { $set: { status: 'resolved' } }
          );
          await Conversation.updateOne(
            { contactId: contact._id },
            { $set: { humanRequired: false, status: 'open' } }
          );
        }
        callback(204);
      } catch (err) { callback({ error: err.message }); }
    });


  });

  // Emite nova mensagem em tempo real para o org correto
  io.broadcastMessage = function(organizationId, phone, message, contact) {
    const normalized = normalizeMessage(message, contact);
    io.to(String(organizationId)).emit('chat:new_message', { ...normalized, phone });
  };

  return io;
}
