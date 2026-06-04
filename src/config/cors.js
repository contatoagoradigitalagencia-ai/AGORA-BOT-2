import cors from 'cors';
import { env } from './env.js';

export function corsMiddleware() {
  return cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (env.corsOrigins.includes(origin) || /\.vercel\.app$/.test(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  });
}
