import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function requireAuth(req, res, next) {
  const apiKey = req.header('x-api-key');
  if (env.internalApiToken && apiKey === env.internalApiToken) {
    req.user = {
      type: 'internal',
      role: 'owner',
      organizationId: req.header('x-organization-id') || null,
    };
    return next();
  }

  const auth = req.header('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || !env.jwtSecret) return res.status(401).json({ error: 'Unauthorized' });

  try {
    req.user = jwt.verify(token, env.jwtSecret);
    return next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}
