import cors from 'cors';
import { env } from './env.js';

/** Rotas de webhook — não devem bloquear provedores (Z-API, Meta). */
export function isWebhookPath(path = '') {
  if (path === '/webhook' || path === '/webhook/meta' || path === '/webhook/zapi') {
    return true;
  }
  return false;
}

const PANEL_EXTRA_ORIGINS = [
  'https://api.z-api.io',
  'https://agora-bot.vercel.app',
];

function isPanelOriginAllowed(origin) {
  if (!origin) return true;
  if (env.corsOrigins.includes(origin)) return true;
  if (PANEL_EXTRA_ORIGINS.includes(origin)) return true;
  if (/\.vercel\.app$/i.test(origin)) return true;
  return false;
}

/** CORS permissivo para webhooks (Z-API / Meta). */
export function webhookCorsMiddleware() {
  return (req, res, next) => {
    if (!isWebhookPath(req.path)) return next();
    return cors({
      origin: true,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-organization-id'],
    })(req, res, next);
  };
}

/** CORS restrito para login, painel e APIs internas. */
export function panelCorsMiddleware() {
  return cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (isPanelOriginAllowed(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  });
}

/** @deprecated Use panelCorsMiddleware — mantido para compatibilidade. */
export function corsMiddleware() {
  return panelCorsMiddleware();
}
