import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { WhatsAppAccount, Contact, Conversation, Message } from '../models/index.js';
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

        // Busca contato pelo telefone (sem filtro de org para doc legado)
        const contact = await Contact.findOne({ phone: String(phone).replace(/\D/g, '') }).lean()
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
        const contact = await Contact.findOne({ phone: String(phone).replace(/\D/g, '') }).lean()
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
        if (!phone) return callback(true);
        const account = await WhatsAppAccount.findOne({ status: 'active' })
          .sort({ createdAt: 1 }).select('provider').lean();

        if (!account || account.provider !== 'meta') return callback(true);

        const contact = await Contact.findOne({ phone }).select('_id').lean();
        if (!contact) return callback(true);

        const lastInbound = await Message.findOne({ contactId: contact._id, direction: 'inbound' })
          .sort({ occurredAt: -1 }).select('occurredAt').lean();

        if (!lastInbound?.occurredAt) return callback(true);

        const diffHours = (Date.now() - new Date(lastInbound.occurredAt).getTime()) / (1000 * 60 * 60);
        callback(diffHours <= 24);
      } catch (err) {
        console.error('[Socket] chat:reply_window error', err.message);
        callback(true);
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
  });

  // Emite nova mensagem em tempo real para o org correto
  io.broadcastMessage = function(organizationId, phone, message, contact) {
    const normalized = normalizeMessage(message, contact);
    io.to(String(organizationId)).emit('chat:new_message', { ...normalized, phone });
  };

  return io;
}
