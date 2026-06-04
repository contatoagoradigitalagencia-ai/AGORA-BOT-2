import { Server } from 'socket.io';
import { env } from '../config/env.js';

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
  });

  return io;
}
