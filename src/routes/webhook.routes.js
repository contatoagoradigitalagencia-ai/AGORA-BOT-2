import { Router } from 'express';
import { env } from '../config/env.js';
import { WhatsAppAccount } from '../models/index.js';
import { normalizeMetaWebhook, normalizeZapiWebhook } from '../providers/whatsapp/index.js';
import { processNormalizedEvent } from '../services/ingestion/message-ingestion.service.js';
import { safeError } from '../services/logging/logger.js';

export function webhookRoutes(io) {
  const router = Router();

  async function verifyMeta(req, res) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
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
      console.log('[Z-API webhook] payload received', {
        payload: req.body,
      });
      const events = normalizeZapiWebhook(req.body);
      console.log('[Z-API webhook] normalized events', {
        count: events.length,
        normalizedEvent: events,
      });
      const results = [];
      for (const event of events) {
        const result = await processNormalizedEvent(event, io);
        results.push(result);
        console.log('[Z-API webhook] ingestion result', {
          event,
          result,
        });
      }
      const paused = results.some((result) => result?.paused === true);
      return res.json({
        ok: true,
        paused,
        received: true,
        events: events.length,
        results,
      });
    } catch (error) {
      console.log('[Z-API webhook] exception', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        payload: req.body,
      });
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
