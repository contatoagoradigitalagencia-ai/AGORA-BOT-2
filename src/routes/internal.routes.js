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

  // ── Equipe / Usuários ────────────────────────────────────────────────────────

  function publicUser(u) {
    const obj = u.toObject ? u.toObject() : { ...u };
    delete obj.passwordHash;
    if (obj._id) obj.id = String(obj._id);
    return obj;
  }

  // GET — lista membros da equipe (filtrado por org)
  router.get('/api/v1/users', requireAuth, requireOrganization, async (req, res) => {
    const filter = { organizationId: toObjectId(req.organizationId) };
    if (req.query.active !== undefined) filter.active = req.query.active !== 'false';
    if (req.query.role) filter.role = { $in: req.query.role.split(',') };
    const users = await User.find(filter).sort({ name: 1 }).lean();
    res.json({ data: users.map(u => { delete u.passwordHash; if (u._id) u.id = String(u._id); return u; }) });
  });

  // POST — cria novo membro (só admin/owner)
  router.post('/api/v1/users', requireAuth, requireOrganization, async (req, res) => {
    const { password, phone, name, email, role, department, avatarUrl, active } = req.body;
    if (!phone || !name) {
      return res.status(400).json({ error: 'name e phone são obrigatórios' });
    }
    const normalizedPhone = String(phone).replace(/\D/g, '');
    // Senha: usa informada ou gera temporária
    const plainPassword = password || Math.random().toString(36).slice(-8);
    const passwordHash = await bcrypt.hash(plainPassword, 12);
    const user = await User.create({
      organizationId: toObjectId(req.organizationId),
      name: String(name).trim(),
      phone: normalizedPhone,
      email: email || \`\${normalizedPhone}@sem-email.local\`,
      role: role || 'agent',
      department: department || '',
      avatarUrl: avatarUrl || '',
      active: active !== false,
      passwordHash,
    });
    const data = publicUser(user);
    if (!password) data._tempPassword = plainPassword; // retorna senha temp se não foi informada
    res.status(201).json({ data });
  });

  // PATCH — edita membro
  router.patch('/api/v1/users/:id', requireAuth, requireOrganization, async (req, res) => {
    const { password, phone, name, email, role, department, avatarUrl, active } = req.body;
    const update = {};
    if (name !== undefined)       update.name       = String(name).trim();
    if (phone !== undefined)      update.phone      = String(phone).replace(/\D/g, '');
    if (email !== undefined)      update.email      = email;
    if (role !== undefined)       update.role       = role;
    if (department !== undefined) update.department = department;
    if (avatarUrl !== undefined)  update.avatarUrl  = avatarUrl;
    if (active !== undefined)     update.active     = Boolean(active);
    if (password)                 update.passwordHash = await bcrypt.hash(password, 12);

    const user = await User.findOneAndUpdate(
      { _id: req.params.id, organizationId: toObjectId(req.organizationId) },
      { $set: update },
      { new: true },
    );
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({ data: publicUser(user) });
  });

  // DELETE — desativa (soft delete)
  router.delete('/api/v1/users/:id', requireAuth, requireOrganization, async (req, res) => {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, organizationId: toObjectId(req.organizationId) },
      { $set: { active: false } },
      { new: true },
    );
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({ data: { deleted: true, id: req.params.id } });
  });

  router.get('/api/v1/whatsapp-accounts', requireOrganization, async (req, res) => {
    let data = await WhatsAppAccount.find(scopedQuery(req)).sort({ createdAt: -1 }).lean();
    // Fallback: se organizationId não bater (doc legado com org vazia), retorna todas as ativas
    if (!data.length) {
      data = await WhatsAppAccount.find({ status: 'active' }).sort({ createdAt: -1 }).limit(10).lean();
    }
    res.json({ data: data.map(publicAccount) });
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
    // Busca com org primeiro; fallback por _id puro (doc legado com organizationId vazio)
    let account = await WhatsAppAccount.findOne({ _id: req.params.id, organizationId: toObjectId(req.organizationId) });
    if (!account) account = await WhatsAppAccount.findById(req.params.id);
    if (!account) return res.status(404).json({ error: 'WhatsApp account not found' });

    const settingsPatch = req.body?.settings && typeof req.body.settings === 'object'
      ? req.body.settings
      : req.body;

    // Apenas campos permitidos
    const allowed = ['autoReply', 'humanHandoff', 'fallbackMessage'];
    const patch = Object.fromEntries(
      Object.entries(settingsPatch).filter(([k]) => allowed.includes(k))
    );

    const data = await WhatsAppAccount.findByIdAndUpdate(
      account._id,
      { $set: { settings: { ...(account.settings || {}), ...patch } } },
      { new: true },
    ).lean();

    res.json({ data: publicAccount(data) });
  });

  router.get('/api/v1/bot-config', requireOrganization, async (req, res) => {
    let accounts = await WhatsAppAccount.find(scopedQuery(req)).sort({ createdAt: 1 }).lean();
    // Fallback: doc legado com organizationId vazio
    if (!accounts.length) {
      accounts = await WhatsAppAccount.find({ status: 'active' }).sort({ createdAt: 1 }).limit(1).lean();
    }
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


  // ── Atendimento humano — request, assign, close ─────────────────────────────

  router.post('/api/v1/conversations/:id/request-human', requireOrganization, async (req, res) => {
    const conversation = await Conversation.findOne({ _id: req.params.id });
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    await Conversation.updateOne(
      { _id: conversation._id },
      { humanRequired: true, status: 'pending_human' },
    );

    await HumanQueue.findOneAndUpdate(
      { conversationId: conversation._id, status: { $in: ['waiting', 'assigned'] } },
      {
        $setOnInsert: {
          organizationId: conversation.organizationId,
          conversationId: conversation._id,
          contactId: conversation.contactId,
          reason: req.body?.reason || 'manual',
          status: 'waiting',
          priority: req.body?.priority || 'normal',
        },
      },
      { upsert: true, new: true },
    );

    res.json({ success: true });
  });

  router.post('/api/v1/conversations/:id/assign', requireOrganization, async (req, res) => {
    const { userId, userName } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId obrigatório' });

    await Conversation.updateOne(
      { _id: req.params.id },
      {
        assignedUserId: userId,
        humanRequired: true,
        status: 'pending_human',
        'metadata.assignedToName': userName || '',
        'metadata.assignedAt': new Date(),
      },
    );

    await HumanQueue.findOneAndUpdate(
      { conversationId: req.params.id, status: { $in: ['waiting', 'assigned'] } },
      { $set: { assignedUserId: userId, status: 'assigned' } },
    );

    res.json({ success: true });
  });

  router.post('/api/v1/conversations/:id/close-human', requireOrganization, async (req, res) => {
    const { resumeBot = false } = req.body || {};

    const update = {
      humanRequired: false,
      assignedUserId: null,
      'metadata.assignedToName': '',
    };
    if (resumeBot) {
      update.status = 'open';
      update.aiEnabled = true;
    } else {
      update.status = 'closed';
    }

    await Conversation.updateOne({ _id: req.params.id }, { $set: update });
    await HumanQueue.findOneAndUpdate(
      { conversationId: req.params.id, status: { $in: ['waiting', 'assigned'] } },
      { $set: { status: 'resolved' } },
    );

    res.json({ success: true });
  });

  // ── Mensagem manual com reply ────────────────────────────────────────────────

  router.post('/api/v1/conversations/:id/messages', requireOrganization, async (req, res) => {
    const { text, replyToMessageId } = req.body || {};
    if (!text?.trim()) return res.status(400).json({ error: 'text obrigatório' });

    const conversation = await Conversation.findOne({ _id: req.params.id }).lean();
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    const contact = await Contact.findById(conversation.contactId).lean();
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const account = await WhatsAppAccount.findById(conversation.whatsappAccountId)
      .select('+accessTokenEncrypted +clientTokenEncrypted +credentials');
    if (!account) return res.status(404).json({ error: 'WhatsApp account not found' });

    // Busca mensagem original para preview
    let replyToPreview = null;
    if (replyToMessageId) {
      const original = await Message.findById(replyToMessageId).lean();
      if (original) {
        replyToPreview = {
          text:        original.text || '',
          type:        original.type || 'text',
          direction:   original.direction,
          occurredAt:  original.occurredAt,
          senderName:  original.direction === 'inbound' ? (contact.name || contact.phone) : 'Bot',
        };
      }
    }

    const provider = getWhatsAppProvider(account.toObject());
    const result = await provider.sendText(contact.phone, text);
    const providerMessageId = result?.messages?.[0]?.id || result?.messageId || result?.id || `manual-${Date.now()}`;

    const message = await Message.create({
      organizationId:          conversation.organizationId,
      whatsappAccountId:       account._id,
      contactId:               contact._id,
      conversationId:          conversation._id,
      provider:                account.provider,
      providerMessageId,
      direction:               'outbound',
      type:                    'text',
      text:                    text.trim(),
      status:                  'sent',
      aiGenerated:             false,
      replyToMessageId:        replyToMessageId || null,
      replyToPreview:          replyToPreview,
      occurredAt:              new Date(),
      raw:                     result || {},
    });

    await Conversation.updateOne(
      { _id: conversation._id },
      { lastMessageAt: new Date(), lastMessagePreview: text.trim().slice(0, 80) },
    );

    res.status(201).json({ data: message });
  });


  // ── Troca de senha ────────────────────────────────────────────────────────
  router.patch('/api/v1/settings/password', requireAuth, async (req, res) => {
    const { password, newPassword } = req.body || {};
    if (!password || !newPassword) {
      return res.status(400).json({ error: 'password e newPassword são obrigatórios' });
    }
    if (newPassword.length < 5) {
      return res.status(400).json({ error: 'Nova senha deve ter pelo menos 5 caracteres' });
    }

    const user = await User.findById(req.user.userId || req.user.sub).select('+passwordHash');
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) return res.status(401).json({ error: 'Senha atual incorreta' });

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();

    res.json({ success: true });
  });

  return router;
}
