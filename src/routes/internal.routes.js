import mongoose from 'mongoose';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import {
  Organization,
  User,
  WhatsAppAccount,
  Product,
  Service,
  Plan,
  BotConfig,
  Prompt,
  KnowledgeBase,
  QuickReply,
  HumanQueue,
  Conversation,
  Contact,
  Message,
} from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/organization.js';
import { encryptSecret } from '../services/security/crypto.js';
import { getWhatsAppProvider } from '../providers/whatsapp/index.js';

const models = {
  products: Product,
  services: Service,
  plans: Plan,
  bot_configs: BotConfig,
  prompts: Prompt,
  knowledge_base: KnowledgeBase,
  quick_replies: QuickReply,
};

function publicAccount(account) {
  const obj = account.toObject ? account.toObject() : { ...account };
  delete obj.accessTokenEncrypted;
  delete obj.clientTokenEncrypted;
  delete obj.credentials;
  delete obj.webhookSecret;
  delete obj.verifyToken;
  // Garante que _id está presente como string (para frontend)
  if (obj._id) obj.id = String(obj._id);
  return obj;
}

function toObjectId(id) {
  try {
    return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;
  } catch {
    return id;
  }
}

function scopedQuery(req) {
  return { organizationId: toObjectId(req.organizationId) };
}

async function getPrimaryWhatsAppAccount(req) {
  return WhatsAppAccount.findOne(scopedQuery(req)).sort({ createdAt: 1 });
}

function cleanObject(payload, allowedFields) {
  return Object.fromEntries(
    allowedFields
      .filter((field) => Object.prototype.hasOwnProperty.call(payload, field))
      .map((field) => [field, payload[field]]),
  );
}

export function internalRoutes() {
  const router = Router();
  router.use('/api/v1', requireAuth);

  router.get('/api/v1/organizations', async (req, res) => {
    const organizations = await Organization.find().sort({ createdAt: -1 }).lean();
    res.json({ data: organizations });
  });

  router.post('/api/v1/organizations', async (req, res) => {
    const organization = await Organization.create(req.body);
    res.status(201).json({ data: organization });
  });

  router.post('/api/v1/users', async (req, res) => {
    const { password, phone, ...rest } = req.body;
    if (!password || !phone) {
      return res.status(400).json({ error: 'phone and password are required' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const normalizedPhone = String(phone).replace(/\D/g, '');
    const user = await User.create({ ...rest, phone: normalizedPhone, passwordHash });
    res.status(201).json({ data: { ...user.toObject(), passwordHash: undefined } });
  });

  router.get('/api/v1/whatsapp-accounts', requireOrganization, async (req, res) => {
    const data = await WhatsAppAccount.find(scopedQuery(req)).sort({ createdAt: -1 }).lean();
    res.json({ data });
  });

  router.post('/api/v1/whatsapp-accounts', requireOrganization, async (req, res) => {
    const payload = {
      ...req.body,
      organizationId: req.organizationId,
      accessTokenEncrypted: encryptSecret(req.body.accessToken),
      clientTokenEncrypted: encryptSecret(req.body.clientToken),
    };
    delete payload.accessToken;
    delete payload.clientToken;
    const account = await WhatsAppAccount.create(payload);
    res.status(201).json({ data: publicAccount(account) });
  });

  router.post('/api/v1/whatsapp-accounts/:id/send-text', requireOrganization, async (req, res) => {
    const account = await WhatsAppAccount.findOne({ _id: req.params.id, organizationId: req.organizationId })
      .select('+accessTokenEncrypted +clientTokenEncrypted +credentials');
    if (!account) return res.status(404).json({ error: 'WhatsApp account not found' });
    const provider = getWhatsAppProvider(account.toObject());
    const result = await provider.sendText(req.body.to, req.body.text);
    res.json({ data: result });
  });

  router.patch('/api/v1/whatsapp-accounts/:id/settings', requireOrganization, async (req, res) => {
    const account = await WhatsAppAccount.findOne({ _id: req.params.id, organizationId: req.organizationId });
    if (!account) return res.status(404).json({ error: 'WhatsApp account not found' });

    const settingsPatch = req.body?.settings && typeof req.body.settings === 'object'
      ? req.body.settings
      : req.body;

    const data = await WhatsAppAccount.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.organizationId },
      { $set: { settings: { ...(account.settings || {}), ...settingsPatch } } },
      { new: true },
    ).lean();

    res.json({ data: publicAccount(data) });
  });

  router.get('/api/v1/bot-config', requireOrganization, async (req, res) => {
    const accounts = await WhatsAppAccount.find(scopedQuery(req)).sort({ createdAt: 1 }).lean();
    const account = accounts[0] || null;
    const config = account
      ? await BotConfig.findOne({ organizationId: req.organizationId, whatsappAccountId: account._id }).lean()
      : null;
    const prompts = await Prompt.find(scopedQuery(req)).sort({ createdAt: -1 }).lean();
    const prompt = config?.promptId
      ? prompts.find((item) => String(item._id) === String(config.promptId)) || null
      : prompts.find((item) => item.active && item.type === 'bot') || null;

    res.json({
      data: {
        account: account ? publicAccount(account) : null,
        config,
        prompt,
        prompts,
      },
    });
  });

  router.patch('/api/v1/bot-config', requireOrganization, async (req, res) => {
    const account = req.body?.whatsappAccountId
      ? await WhatsAppAccount.findOne({ _id: req.body.whatsappAccountId, organizationId: req.organizationId })
      : await getPrimaryWhatsAppAccount(req);
    if (!account) return res.status(404).json({ error: 'WhatsApp account not found' });

    const payload = cleanObject(req.body || {}, [
      'aiEnabled',
      'catalogEnabled',
      'humanHandoffEnabled',
      'humanHandoffKeywords',
      'fallbackMessage',
      'promptId',
      'settings',
    ]);

    const data = await BotConfig.findOneAndUpdate(
      { organizationId: req.organizationId, whatsappAccountId: account._id },
      {
        $set: payload,
        $setOnInsert: {
          organizationId: req.organizationId,
          whatsappAccountId: account._id,
        },
      },
      { new: true, upsert: true },
    );

    res.json({ data });
  });

  for (const [path, Model] of Object.entries(models)) {
    router.get(`/api/v1/${path}`, requireOrganization, async (req, res) => {
      const data = await Model.find(scopedQuery(req)).sort({ createdAt: -1 }).limit(200).lean();
      res.json({ data });
    });

    router.post(`/api/v1/${path}`, requireOrganization, async (req, res) => {
      const data = await Model.create({ ...req.body, organizationId: req.organizationId });
      res.status(201).json({ data });
    });

    router.patch(`/api/v1/${path}/:id`, requireOrganization, async (req, res) => {
      const data = await Model.findOneAndUpdate(
        { _id: req.params.id, organizationId: req.organizationId },
        req.body,
        { new: true },
      );
      if (!data) return res.status(404).json({ error: 'Not found' });
      res.json({ data });
    });
  }

  router.get('/api/v1/conversations', requireOrganization, async (req, res) => {
    const data = await Conversation.find(scopedQuery(req)).sort({ lastMessageAt: -1 }).limit(200).lean();
    res.json({ data });
  });

  router.get('/api/v1/contacts', requireOrganization, async (req, res) => {
    const data = await Contact.find(scopedQuery(req)).sort({ lastMessageAt: -1 }).limit(200).lean();
    res.json({ data });
  });

  router.get('/api/v1/messages', requireOrganization, async (req, res) => {
    const filter = { ...scopedQuery(req) };
    if (req.query.conversationId) filter.conversationId = req.query.conversationId;
    const data = await Message.find(filter).sort({ occurredAt: -1 }).limit(200).lean();
    res.json({ data });
  });

  router.get('/api/v1/human-queue', requireOrganization, async (req, res) => {
    const data = await HumanQueue.find(scopedQuery(req)).sort({ createdAt: 1 }).limit(200).lean();
    res.json({ data });
  });

  // ── Métricas de economia de tokens ──
  router.get('/api/v1/metrics/bot', requireOrganization, async (req, res) => {
    const { getMetricsSummary } = await import('../services/metrics/metrics.service.js');
    const { getCacheStats } = await import('../services/cache/cache.service.js');
    res.json({ data: { ...getMetricsSummary(), cache: getCacheStats() } });
  });

  // ── FAQ CRUD ──
  router.get('/api/v1/faq', requireOrganization, async (req, res) => {
    const { Faq } = await import('../services/rules/faq.service.js');
    const data = await Faq.find({ organizationId: req.organizationId }).sort({ createdAt: -1 }).lean();
    res.json({ data });
  });

  router.post('/api/v1/faq', requireOrganization, async (req, res) => {
    const { Faq } = await import('../services/rules/faq.service.js');
    const { cacheInvalidate } = await import('../services/cache/cache.service.js');
    const data = await Faq.create({ ...req.body, organizationId: req.organizationId });
    cacheInvalidate('faq', req.organizationId);
    res.status(201).json({ data });
  });

  router.patch('/api/v1/faq/:id', requireOrganization, async (req, res) => {
    const { Faq } = await import('../services/rules/faq.service.js');
    const { cacheInvalidate } = await import('../services/cache/cache.service.js');
    const data = await Faq.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.organizationId },
      req.body,
      { new: true },
    );
    if (!data) return res.status(404).json({ error: 'Not found' });
    cacheInvalidate('faq', req.organizationId);
    res.json({ data });
  });

  router.delete('/api/v1/faq/:id', requireOrganization, async (req, res) => {
    const { Faq } = await import('../services/rules/faq.service.js');
    const { cacheInvalidate } = await import('../services/cache/cache.service.js');
    await Faq.findOneAndDelete({ _id: req.params.id, organizationId: req.organizationId });
    cacheInvalidate('faq', req.organizationId);
    res.json({ data: { deleted: true } });
  });

  // ── DELETE para catálogo (produtos, serviços, planos) ──
  for (const [path, Model] of Object.entries(models)) {
    router.delete(`/api/v1/${path}/:id`, requireOrganization, async (req, res) => {
      const { cacheInvalidateAll } = await import('../services/cache/cache.service.js');
      const data = await Model.findOneAndDelete({ _id: req.params.id, organizationId: req.organizationId });
      if (!data) return res.status(404).json({ error: 'Not found' });
      cacheInvalidateAll(req.organizationId);
      res.json({ data: { deleted: true } });
    });
  }

  // ── Invalidar cache ao salvar catálogo ──
  // (os POSTs e PATCHs do loop acima não invalidam — sobrescrevemos os handlers de catálogo)
  for (const catalogPath of ['products', 'services', 'plans']) {
    const Model = models[catalogPath];
    if (!Model) continue;

    router.post(`/api/v1/${catalogPath}/invalidate-cache`, requireOrganization, async (req, res) => {
      const { cacheInvalidateAll } = await import('../services/cache/cache.service.js');
      cacheInvalidateAll(req.organizationId);
      res.json({ data: { invalidated: true } });
    });
  }

  return router;
}
