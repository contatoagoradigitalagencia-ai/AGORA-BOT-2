import crypto from 'node:crypto';
import { Router } from 'express';
import { env } from '../config/env.js';
import { WhatsAppAccount } from '../models/index.js';
import { normalizeMetaWebhook, normalizeZapiWebhook } from '../providers/whatsapp/index.js';
import { processNormalizedEvent } from '../services/ingestion/message-ingestion.service.js';
import { safeError, safeLog } from '../services/logging/logger.js';

// Verifica assinatura HMAC-SHA256 do Meta
function verifyMetaSignature(rawBody, signature, appSecret) {
  if (!appSecret || !signature) return false;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function webhookRoutes(io) {
  const router = Router();

  async function verifyMeta(req, res) {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode !== 'subscribe' || !challenge) return res.sendStatus(403);

    const account = token
      ? await WhatsAppAccount.findOne({ provider: 'meta', verifyToken: token }).select('_id')
      : null;

    if (account || (env.metaVerifyToken && token === env.metaVerifyToken)) {
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  }

  async function receiveMeta(req, res) {
    try {
      // Verifica assinatura HMAC — protege contra payloads falsos
      const signature = req.headers['x-hub-signature-256'];
      const appSecret = env.metaAppSecret || process.env.META_APP_SECRET;

      if (appSecret) {
        const valid = verifyMetaSignature(req.rawBody, signature, appSecret);
        if (!valid) {
          safeLog('[Meta webhook] invalid signature — rejected');
          return res.sendStatus(401);
        }
      }

      const events = normalizeMetaWebhook(req.body);
      for (const event of events) await processNormalizedEvent(event, io);
      return res.json({ received: true, events: events.length });
    } catch (error) {
      safeError('[Meta webhook] failed', error);
      return res.status(500).json({ error: 'Failed to process Meta webhook' });
    }
  }

  async function receiveZapi(req, res) {
    try {
      const events = normalizeZapiWebhook(req.body);
      const results = [];
      for (const event of events) {
        const result = await processNormalizedEvent(event, io);
        results.push(result);
      }
      safeLog('[Z-API webhook] processed', { events: events.length });
      const paused = results.some(r => r?.paused === true);
      return res.json({ ok: true, paused, received: true, events: events.length });
    } catch (error) {
      safeError('[Z-API webhook] failed', error);
      return res.status(500).json({ error: 'Failed to process Z-API webhook' });
    }
  }

  router.get('/webhook/meta', verifyMeta);
  router.post('/webhook/meta', receiveMeta);
  router.get('/webhook', verifyMeta);
  router.post('/webhook', receiveMeta);
  router.post('/webhook/zapi', receiveZapi);

  return router;
}
