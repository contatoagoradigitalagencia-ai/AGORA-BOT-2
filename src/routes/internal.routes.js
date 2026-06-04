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
  const obj = account.toObject ? account.toObject() : account;
  delete obj.accessTokenEncrypted;
  delete obj.clientTokenEncrypted;
  delete obj.webhookSecret;
  return obj;
}

function scopedQuery(req) {
  return { organizationId: req.organizationId };
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
      .select('+accessTokenEncrypted +clientTokenEncrypted');
    if (!account) return res.status(404).json({ error: 'WhatsApp account not found' });
    const provider = getWhatsAppProvider(account.toObject());
    const result = await provider.sendText(req.body.to, req.body.text);
    res.json({ data: result });
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

  return router;
}
