import express from 'express';
import { webhookCorsMiddleware, panelCorsMiddleware } from './config/cors.js';
import { healthRoutes } from './routes/health.routes.js';
import { webhookRoutes } from './routes/webhook.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { internalRoutes } from './routes/internal.routes.js';
import { safeError } from './services/logging/logger.js';

export function createApp({ io } = {}) {
  const app = express();

  app.use(express.json({
    limit: '5mb',
    verify: (req, res, buffer) => {
      req.rawBody = buffer;
    },
  }));

  // Webhooks antes do CORS restrito — Z-API/Meta não podem ser bloqueados
  app.use(webhookCorsMiddleware());
  app.use(webhookRoutes(io));

  app.use(panelCorsMiddleware());

  app.use(healthRoutes);
  app.use(authRoutes());
  app.use(internalRoutes());

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((error, req, res, next) => {
    safeError('[HTTP] unhandled error', error, { path: req.path, method: req.method });
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
