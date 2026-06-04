import { Router } from 'express';
import { authenticateWithPhone } from '../services/auth/auth.service.js';
import { safeError } from '../services/logging/logger.js';

export function authRoutes() {
  const router = Router();

  router.post('/login', async (req, res) => {
    try {
      const { phone, password } = req.body || {};
      const result = await authenticateWithPhone(phone, password);

      if (result.error) {
        const message = result.error === 'auth_not_configured'
          ? 'Authentication is not configured'
          : 'Invalid phone or password';
        return res.status(result.status).json({ error: message });
      }

      return res.status(200).json({
        idPhone: result.idPhone,
        token: result.token,
      });
    } catch (error) {
      safeError('[Auth] login failed', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
