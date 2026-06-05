import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { WhatsAppAccount, Contact, Message } from '../models/index.js';

export function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: env.corsOrigins,
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    const organizationId = socket.handshake.auth?.organizationId || socket.handshake.query?.organizationId;
    if (organizationId) socket.join(String(organizationId));
    socket.emit('connected', { service: 'agora-bot-2' });

    /**
     * Verifica se a janela de 24h está aberta para o contato.
     * - Z-API: sempre retorna true (sem restrição)
     * - Meta: retorna false se último inbound > 24h
     */
    socket.on('chat:reply_window', async ({ phone } = {}, callback) => {
      if (typeof callback !== 'function') return;
      try {
        if (!organizationId || !phone) return callback(true);

        // Descobre o provider da conta principal da organização
        const account = await WhatsAppAccount.findOne({ organizationId })
          .sort({ createdAt: 1 })
          .select('provider')
          .lean();

        // Z-API não tem restrição de janela
        if (!account || account.provider !== 'meta') return callback(true);

        // Meta: verifica último inbound
        const contact = await Contact.findOne({ organizationId, phone }).select('_id').lean();
        if (!contact) return callback(true);

        const lastInbound = await Message.findOne({
          organizationId,
          contactId: contact._id,
          direction: 'inbound',
        }).sort({ occurredAt: -1 }).select('occurredAt').lean();

        if (!lastInbound?.occurredAt) return callback(true);

        const diffHours = (Date.now() - new Date(lastInbound.occurredAt).getTime()) / (1000 * 60 * 60);
        return callback(diffHours <= 24);
      } catch (err) {
        console.error('[Socket] chat:reply_window error', err.message);
        callback(true); // fail-open
      }
    });
  });

  return io;
}
