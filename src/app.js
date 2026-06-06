import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { webhookCorsMiddleware, panelCorsMiddleware } from './config/cors.js';
import { healthRoutes } from './routes/health.routes.js';
import { webhookRoutes } from './routes/webhook.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { internalRoutes } from './routes/internal.routes.js';
import { safeError } from './services/logging/logger.js';

// Rate limiters
const apiLimiter = rateLimit({
  windowMs:         60 * 1000,      // 1 minuto
  max:              120,             // 120 req/min por IP
  standardHeaders: 'draft-7',
  legacyHeaders:    false,
  message:          { error: 'Muitas requisições. Tente novamente em instantes.' },
  skip: (req) => req.path.startsWith('/webhook'), // webhooks não têm limite
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutos
  max:      20,               // 20 tentativas de login por IP
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
});

export function createApp({ io } = {}) {
  const app = express();
  if (io) app.set('io', io);

  // Security headers via Helmet
  app.use(helmet({
    crossOriginEmbedderPolicy: false, // permite iframes do WhatsApp
    contentSecurityPolicy: {
      directives: {
        defaultSrc:  ["'self'"],
        scriptSrc:   ["'self'"],
        connectSrc:  ["'self'", 'https://api.z-api.io', 'https://graph.facebook.com', 'https://*.supabase.co'],
        frameSrc:    ["'none'"],
        objectSrc:   ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
  }));

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

  // Rate limiting — aplicado APÓS webhooks
  app.use('/api/v1', apiLimiter);
  app.use('/api/v1/auth', authLimiter);

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
