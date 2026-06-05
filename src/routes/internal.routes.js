import mongoose from 'mongoose';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import {
  Organization,
  User,
  Attendant,
  ClientIntegration,
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
  Log,
  ErrorLog,
} from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/organization.js';
import { requireAdminRole } from '../middleware/admin.js';
import { encryptSecret, decryptSecret } from '../services/security/crypto.js';
import { canSendFreeformMessage } from '../services/messaging/send-window.js';
import { getWhatsAppProvider } from '../providers/whatsapp/index.js';
import { env } from '../config/env.js';

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

function slugify(value) {
  return String(value || 'cliente')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'cliente';
}

async function uniqueSlug(name, currentId) {
  const base = slugify(name);
  let slug = base;
  let suffix = 1;
  while (await Organization.exists({ slug, ...(currentId ? { _id: { $ne: currentId } } : {}) })) {
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
  return slug;
}

function publicOrganization(org) {
  const obj = org.toObject ? org.toObject() : { ...org };
  if (obj._id) obj.id = String(obj._id);
  return obj;
}

function organizationPayload(body) {
  const allowed = [
    'name',
    'slug',
    'ownerName',
    'responsibleName',
    'phone',
    'email',
    'plan',
    'notes',
    'status',
    'settings',
  ];
  return cleanObject(body || {}, allowed);
}

function adminOrganizationFilter(req) {
  return req.query.organizationId
    ? { organizationId: toObjectId(req.query.organizationId) }
    : {};
}

function maskSecret(value) {
  if (!value || String(value).length < 6) return '****';
  return '****' + String(value).slice(-4);
}

function redactSensitive(value) {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (/token|secret|password|key|credential/i.test(key)) {
        return [key, entry ? maskSecret(String(entry)) : entry];
      }
      return [key, redactSensitive(entry)];
    }),
  );
}

export function internalRoutes() {
  const router = Router();
  router.use('/api/v1', requireAuth);

  router.get('/api/v1/me', async (req, res) => {
    if (req.user?.type === 'internal') {
      return res.json({ data: { ...req.user, id: req.user.userId || req.user.id || 'internal' } });
    }

    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const user = userId ? await User.findById(userId).lean() : null;
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    delete user.passwordHash;
    user.id = String(user._id);
    res.json({ data: user });
  });

  router.get('/api/v1/organizations', requireAdminRole, async (req, res) => {
    const organizations = await Organization.find().sort({ createdAt: -1 }).lean();
    res.json({ data: organizations.map(publicOrganization) });
  });

  router.post('/api/v1/organizations', requireAdminRole, async (req, res) => {
    const payload = organizationPayload(req.body);
    if (!payload.name?.trim()) return res.status(400).json({ error: 'name obrigatório' });
    payload.slug = payload.slug ? slugify(payload.slug) : await uniqueSlug(payload.name);
    const organization = await Organization.create(payload);
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
      email: email || (normalizedPhone + '@sem-email.local'),
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
    if (!data.length) {
      data = await WhatsAppAccount.find({ status: 'active' }).sort({ createdAt: -1 }).limit(10).lean();
    }

    // Verifica status real na Z-API em tempo real (não confia só no banco)
    const enriched = await Promise.all(data.map(async (account) => {
      const pub = publicAccount(account);
      if (account.provider !== 'zapi') return pub;
      try {
        const instanceId = account.credentials?.instanceId || account.instanceId || account.externalId;
        const token      = account.credentials?.instanceToken || account.credentials?.clientToken;
        const baseUrl    = account.credentials?.baseUrl || 'https://api.z-api.io';
        if (!instanceId || !token) return pub;

        const zapiRes = await fetch(
          `${baseUrl.replace(/\/$/, '')}/instances/${instanceId}/token/${token}/status`,
          { signal: AbortSignal.timeout(4000) }
        );
        if (!zapiRes.ok) return { ...pub, connectionStatus: 'unknown' };
        const zapiData = await zapiRes.json();

        // Z-API retorna connected: true/false ou value: "open"/"close"
        const connected = zapiData?.connected === true
          || zapiData?.value === 'open'
          || zapiData?.status === 'open'
          || zapiData?.session === 'open';

        const connectionStatus = connected ? 'connected' : 'disconnected';

        // Atualiza banco se mudou (sem bloquear resposta)
        if (connected && account.status !== 'active') {
          WhatsAppAccount.updateOne({ _id: account._id }, { status: 'active' }).catch(() => {});
        } else if (!connected && account.status === 'active') {
          WhatsAppAccount.updateOne({ _id: account._id }, { status: 'inactive' }).catch(() => {});
        }

        return { ...pub, connectionStatus };
      } catch {
        return { ...pub, connectionStatus: 'unknown' };
      }
    }));

    res.json({ data: enriched });
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

    // Apenas campos permitidos. Inclui controles de grupo e limites usados pelo painel Bot.
    const allowed = [
      'autoReply',
      'humanHandoff',
      'humanHandoffEnabled',
      'fallbackMessage',
      'groupRepliesEnabled',
      'groupReplyMode',
      'blockNewsletter',
      'defaultProvider',
      'aiDailyLimit',
      'aiModel',
      'model',
    ];
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

    // Verifica janela de envio
    const windowCheck = await canSendFreeformMessage({
      provider:       account.provider,
      conversationId: conversation._id,
      Message,
    });
    if (!windowCheck.allowed) {
      return res.status(403).json({
        error: 'Fora da janela de 24h da Meta. Use um template aprovado.',
        reason: windowCheck.reason,
        requiresTemplate: windowCheck.requiresTemplate,
      });
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


  // ── Atendentes (identificadores simples, sem senha) ──────────────────────

  router.get('/api/v1/attendants', requireOrganization, async (req, res) => {
    const filter = { organizationId: toObjectId(req.organizationId) };
    if (req.query.active !== undefined) filter.active = req.query.active !== 'false';
    const data = await Attendant.find(filter).sort({ name: 1 }).lean();
    res.json({ data: data.map(a => ({ ...a, id: String(a._id) })) });
  });

  router.post('/api/v1/attendants', requireOrganization, async (req, res) => {
    const { name, displayName, phone, roleLabel, colorTag, notes, active } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name é obrigatório' });
    const data = await Attendant.create({
      organizationId: toObjectId(req.organizationId),
      name: name.trim(),
      displayName: displayName?.trim() || name.trim(),
      phone: phone ? String(phone).replace(/\D/g, '') : '',
      roleLabel: roleLabel || 'Atendente',
      colorTag: colorTag || 'orange',
      notes: notes || '',
      active: active !== false,
    });
    res.status(201).json({ data: { ...data.toObject(), id: String(data._id) } });
  });

  router.patch('/api/v1/attendants/:id', requireOrganization, async (req, res) => {
    const { name, displayName, phone, roleLabel, colorTag, notes, active } = req.body;
    const update = {};
    if (name !== undefined)        update.name        = name.trim();
    if (displayName !== undefined) update.displayName = displayName.trim();
    if (phone !== undefined)       update.phone       = String(phone).replace(/\D/g, '');
    if (roleLabel !== undefined)   update.roleLabel   = roleLabel;
    if (colorTag !== undefined)    update.colorTag    = colorTag;
    if (notes !== undefined)       update.notes       = notes;
    if (active !== undefined)      update.active      = Boolean(active);
    const data = await Attendant.findOneAndUpdate(
      { _id: req.params.id, organizationId: toObjectId(req.organizationId) },
      { $set: update },
      { new: true },
    ).lean();
    if (!data) return res.status(404).json({ error: 'Atendente não encontrado' });
    res.json({ data: { ...data, id: String(data._id) } });
  });

  router.delete('/api/v1/attendants/:id', requireOrganization, async (req, res) => {
    const data = await Attendant.findOneAndUpdate(
      { _id: req.params.id, organizationId: toObjectId(req.organizationId) },
      { $set: { active: false } },
      { new: true },
    ).lean();
    if (!data) return res.status(404).json({ error: 'Atendente não encontrado' });
    res.json({ data: { deleted: true, id: req.params.id } });
  });


  // ── Admin — operação real multiempresa ─────────────────────────────────────

  function publicIntegration(doc) {
    const obj = doc.toObject ? doc.toObject() : { ...doc };
    if (obj._id) obj.id = String(obj._id);
    if (obj.organizationId && typeof obj.organizationId === 'object' && obj.organizationId._id) {
      obj.organization = publicOrganization(obj.organizationId);
      obj.organizationId = String(obj.organizationId._id);
    } else if (obj.organizationId) {
      obj.organizationId = String(obj.organizationId);
    }
    if (obj.metaAccessToken) obj.metaAccessToken = maskSecret(obj.metaAccessToken);
    if (obj.metaVerifyToken) obj.metaVerifyToken = maskSecret(obj.metaVerifyToken);
    if (obj.metaAppSecret) obj.metaAppSecret = maskSecret(obj.metaAppSecret);
    if (obj.zapiInstanceToken) obj.zapiInstanceToken = maskSecret(obj.zapiInstanceToken);
    if (obj.zapiClientToken) obj.zapiClientToken = maskSecret(obj.zapiClientToken);
    return obj;
  }

  async function runIntegrationTest(doc) {
    const testedAt = new Date();
    const result = {
      ok: false,
      provider: doc.provider,
      status: 'error',
      connected: false,
      phoneNumber: '',
      error: null,
      message: '',
      testedAt,
    };

    try {
      if (doc.provider === 'meta') {
        const token = decryptSecret(doc.metaAccessToken);
        const phoneId = doc.metaPhoneNumberId;
        if (!token || !phoneId) throw new Error('Access Token e Phone Number ID são obrigatórios');
        const r = await fetch(
          `https://graph.facebook.com/${env.metaGraphVersion}/${phoneId}?fields=id,display_phone_number`,
          { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000) },
        );
        const data = await r.json();
        if (data.error) throw new Error(data.error.message);
        result.ok = true;
        result.status = 'connected';
        result.connected = true;
        result.phoneNumber = data.display_phone_number || data.id || '';
        result.message = `Conectado: ${result.phoneNumber || phoneId}`;
      } else {
        const instanceId = doc.zapiInstanceId;
        const token = decryptSecret(doc.zapiInstanceToken);
        const base = (doc.zapiBaseUrl || 'https://api.z-api.io').replace(/\/$/, '');
        if (!instanceId || !token) throw new Error('Instance ID e Token são obrigatórios');
        const r = await fetch(
          `${base}/instances/${instanceId}/token/${token}/status`,
          { signal: AbortSignal.timeout(6000) },
        );
        const data = await r.json();
        const connected = data?.connected === true
          || data?.value === 'open'
          || data?.status === 'open'
          || data?.session === 'open';
        if (!connected) throw new Error('Instância desconectada ou inválida');
        result.ok = true;
        result.status = 'connected';
        result.connected = true;
        result.phoneNumber = doc.zapiInstanceId;
        result.message = 'Z-API conectada';
      }
    } catch (err) {
      result.error = err.message;
      result.message = err.message;
    }

    return result;
  }

  function integrationPayload(req) {
    const secretFields = ['metaAccessToken', 'metaVerifyToken', 'metaAppSecret', 'zapiInstanceToken', 'zapiClientToken'];
    const allowed = [
      'clientName',
      'companyName',
      'provider',
      'status',
      'zapiBaseUrl',
      'metaWabaId',
      'metaPhoneNumberId',
      'metaAppId',
      'metaAccessToken',
      'metaVerifyToken',
      'metaAppSecret',
      'zapiInstanceId',
      'zapiInstanceToken',
      'zapiClientToken',
    ];
    const update = cleanObject(req.body || {}, allowed);
    for (const key of secretFields) {
      if (update[key]) update[key] = encryptSecret(update[key]);
      if (update[key] === '') delete update[key];
    }
    if (update.clientName) update.clientName = update.clientName.trim();
    if (update.companyName) update.companyName = update.companyName.trim();
    return update;
  }

  router.get('/api/v1/admin/overview', requireAdminRole, async (req, res) => {
    const [
      organizationsCount,
      activeOrganizationsCount,
      activeIntegrations,
      pendingIntegrations,
      errorIntegrations,
      zapiIntegrations,
      metaIntegrations,
      whatsappAccounts,
      conversationsCount,
      messagesCount,
      latestError,
      latestTest,
    ] = await Promise.all([
      Organization.countDocuments({}),
      Organization.countDocuments({ status: 'active' }),
      ClientIntegration.countDocuments({ status: 'active' }),
      ClientIntegration.countDocuments({ status: 'pending' }),
      ClientIntegration.countDocuments({ status: 'error' }),
      ClientIntegration.countDocuments({ provider: 'zapi' }),
      ClientIntegration.countDocuments({ provider: 'meta' }),
      WhatsAppAccount.countDocuments({}),
      Conversation.countDocuments({}),
      Message.countDocuments({}),
      ErrorLog.findOne({}).sort({ createdAt: -1 }).lean(),
      ClientIntegration.findOne({ lastTestedAt: { $ne: null } }).sort({ lastTestedAt: -1 }).lean(),
    ]);

    res.json({
      data: {
        organizationsCount,
        activeOrganizationsCount,
        integrations: {
          active: activeIntegrations,
          pending: pendingIntegrations,
          error: errorIntegrations,
          zapi: zapiIntegrations,
          meta: metaIntegrations,
        },
        whatsappAccounts,
        conversationsCount,
        messagesCount,
        latestError: latestError ? redactSensitive(latestError) : null,
        latestTest: latestTest ? publicIntegration(latestTest) : null,
      },
    });
  });

  router.get('/api/v1/admin/organizations', requireAdminRole, async (req, res) => {
    const data = await Organization.find().sort({ createdAt: -1 }).lean();
    res.json({ data: data.map(publicOrganization) });
  });

  router.post('/api/v1/admin/organizations', requireAdminRole, async (req, res) => {
    const payload = organizationPayload(req.body);
    if (!payload.name?.trim()) return res.status(400).json({ error: 'name obrigatório' });
    payload.slug = payload.slug ? slugify(payload.slug) : await uniqueSlug(payload.name);
    const organization = await Organization.create(payload);
    res.status(201).json({ data: publicOrganization(organization) });
  });

  router.patch('/api/v1/admin/organizations/:id', requireAdminRole, async (req, res) => {
    const payload = organizationPayload(req.body);
    if (payload.slug) payload.slug = await uniqueSlug(payload.slug, req.params.id);
    const organization = await Organization.findByIdAndUpdate(
      req.params.id,
      { $set: payload },
      { new: true },
    );
    if (!organization) return res.status(404).json({ error: 'Organização não encontrada' });
    res.json({ data: publicOrganization(organization) });
  });

  router.delete('/api/v1/admin/organizations/:id', requireAdminRole, async (req, res) => {
    const conversations = await Conversation.countDocuments({ organizationId: toObjectId(req.params.id) });
    const organization = await Organization.findByIdAndUpdate(
      req.params.id,
      { $set: { status: 'inactive' } },
      { new: true },
    );
    if (!organization) return res.status(404).json({ error: 'Organização não encontrada' });
    res.json({
      data: {
        deleted: false,
        inactivated: true,
        conversations,
        organization: publicOrganization(organization),
      },
    });
  });

  router.get('/api/v1/admin/logs', requireAdminRole, async (req, res) => {
    const filter = {};
    if (req.query.organizationId) filter.organizationId = toObjectId(req.query.organizationId);
    if (req.query.level) filter.level = req.query.level;
    const limit = Math.min(Number(req.query.limit || 80), 200);
    const [logs, errors] = await Promise.all([
      Log.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
      ErrorLog.find(req.query.organizationId ? { organizationId: toObjectId(req.query.organizationId) } : {})
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
    ]);
    const data = [
      ...logs.map((item) => ({ ...item, kind: 'log' })),
      ...errors.map((item) => ({ ...item, level: 'error', kind: 'error' })),
    ]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit)
      .map(redactSensitive);
    res.json({ data });
  });

  router.get('/api/v1/admin/integrations', requireAdminRole, async (req, res) => {
    const data = await ClientIntegration.find(adminOrganizationFilter(req))
      .populate('organizationId', 'name slug status')
      .sort({ createdAt: -1 });
    res.json({ data: data.map(publicIntegration) });
  });

  router.post('/api/v1/admin/integrations', requireAdminRole, async (req, res) => {
    const payload = integrationPayload(req);
    if (!payload.clientName?.trim()) return res.status(400).json({ error: 'clientName obrigatório' });
    if (!payload.provider) return res.status(400).json({ error: 'provider obrigatório' });
    const organizationId = req.body.organizationId || req.organizationId;
    if (!organizationId) return res.status(400).json({ error: 'organizationId obrigatório' });

    const doc = await ClientIntegration.create({
      ...payload,
      organizationId: toObjectId(organizationId),
      companyName: payload.companyName || '',
      status: payload.status || 'pending',
      zapiBaseUrl: payload.zapiBaseUrl || 'https://api.z-api.io',
    });

    res.status(201).json({ data: publicIntegration(doc) });
  });

  router.patch('/api/v1/admin/integrations/:id', requireAdminRole, async (req, res) => {
    const update = integrationPayload(req);
    if (req.body.organizationId) update.organizationId = toObjectId(req.body.organizationId);
    const doc = await ClientIntegration.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true },
    );
    if (!doc) return res.status(404).json({ error: 'Integração não encontrada' });
    res.json({ data: publicIntegration(doc) });
  });

  router.delete('/api/v1/admin/integrations/:id', requireAdminRole, async (req, res) => {
    const doc = await ClientIntegration.findByIdAndUpdate(
      req.params.id,
      { $set: { status: 'inactive' } },
      { new: true },
    );
    if (!doc) return res.status(404).json({ error: 'Integração não encontrada' });
    res.json({ data: { deleted: false, inactivated: true } });
  });

  router.post('/api/v1/admin/integrations/:id/test', requireAdminRole, async (req, res) => {
    const doc = await ClientIntegration.findById(req.params.id)
      .select('+metaAccessToken +metaVerifyToken +metaAppSecret +zapiInstanceToken +zapiClientToken');
    if (!doc) return res.status(404).json({ error: 'Integração não encontrada' });

    const result = await runIntegrationTest(doc);
    await ClientIntegration.updateOne(
      { _id: doc._id },
      { $set: { lastTestedAt: result.testedAt, lastTestResult: result.message, status: result.ok ? 'active' : 'error' } },
    );

    res.json(result);
  });

  router.post('/api/v1/admin/integrations/:id/activate', requireAdminRole, async (req, res) => {
    const doc = await ClientIntegration.findById(req.params.id)
      .select('+metaAccessToken +metaVerifyToken +metaAppSecret +zapiInstanceToken +zapiClientToken');
    if (!doc) return res.status(404).json({ error: 'Integração não encontrada' });

    if (doc.status !== 'active') {
      return res.status(400).json({ error: 'Teste a conexão antes de ativar esta integração' });
    }

    const organizationId = toObjectId(doc.organizationId);
    const commonSettings = {
      autoReply: false,
      groupRepliesEnabled: false,
      groupReplyMode: 'mention_only',
      blockNewsletter: true,
    };

    let account;
    if (doc.provider === 'zapi') {
      if (!doc.zapiInstanceId || !doc.zapiInstanceToken) {
        return res.status(400).json({ error: 'Instance ID e Token Z-API são obrigatórios' });
      }

      account = await WhatsAppAccount.findOneAndUpdate(
        { organizationId, provider: 'zapi', instanceId: doc.zapiInstanceId },
        {
          $set: {
            organizationId,
            provider: 'zapi',
            label: doc.companyName || doc.clientName,
            phoneNumber: doc.zapiInstanceId,
            externalId: doc.zapiInstanceId,
            instanceId: doc.zapiInstanceId,
            accessTokenEncrypted: doc.zapiInstanceToken,
            clientTokenEncrypted: doc.zapiClientToken,
            credentials: { instanceId: doc.zapiInstanceId, baseUrl: doc.zapiBaseUrl || 'https://api.z-api.io' },
            status: 'active',
            settings: commonSettings,
          },
        },
        { new: true, upsert: true },
      );
    } else {
      if (!doc.metaPhoneNumberId || !doc.metaAccessToken) {
        return res.status(400).json({ error: 'Phone Number ID e Access Token Meta são obrigatórios' });
      }

      account = await WhatsAppAccount.findOneAndUpdate(
        { organizationId, provider: 'meta', phoneNumberId: doc.metaPhoneNumberId },
        {
          $set: {
            organizationId,
            provider: 'meta',
            label: doc.companyName || doc.clientName,
            phoneNumber: doc.metaPhoneNumberId,
            phoneNumberId: doc.metaPhoneNumberId,
            wabaId: doc.metaWabaId || '',
            externalId: doc.metaPhoneNumberId,
            accessTokenEncrypted: doc.metaAccessToken,
            verifyToken: decryptSecret(doc.metaVerifyToken),
            webhookSecret: doc.metaAppSecret,
            credentials: { appId: doc.metaAppId || '', graphVersion: env.metaGraphVersion },
            status: 'active',
            settings: commonSettings,
          },
        },
        { new: true, upsert: true },
      );
    }

    await WhatsAppAccount.updateMany(
      { organizationId, _id: { $ne: account._id } },
      { $set: { status: 'inactive' } },
    );

    res.json({ data: publicAccount(account) });
  });


  // ── Setup inicial — criar admin ─────────────────────────────────────────
  // REMOVER após primeiro uso
  router.post('/api/v1/setup/admin', async (req, res) => {
    const { secret, password, name, phone } = req.body || {};

    // Aceita SETUP_SECRET da env OU valor fixo de emergência
    const SETUP_SECRET = process.env.SETUP_SECRET || 'agora2024setup';
    if (secret !== SETUP_SECRET) {
      return res.status(403).json({ error: 'Forbidden', hint: 'Verifique o campo secret' });
    }
    if (!password || !phone) {
      return res.status(400).json({ error: 'password e phone são obrigatórios' });
    }

    try {
      const { normalizePhone, hashPassword } = await import('../services/auth/auth.service.js');
      const normalizedPhone = normalizePhone(phone);
      const passwordHash    = await hashPassword(password);

      // Garante que existe uma organização
      let org = await Organization.findOne({});
      if (!org) {
        org = await Organization.create({
          name: name || 'Agora Digital',
          slug: 'agora-digital',
          status: 'active',
        });
      }

      // Cria ou atualiza o usuário
      const existing = await User.findOne({ phone: normalizedPhone });
      let user;
      if (existing) {
        existing.passwordHash  = passwordHash;
        existing.organizationId = org._id;
        existing.role           = 'owner';
        existing.active         = true;
        if (name) existing.name = name;
        await existing.save();
        user = existing;
      } else {
        user = await User.create({
          organizationId: org._id,
          name:           name || 'Admin',
          phone:          normalizedPhone,
          email:          normalizedPhone + '@agora.local',
          role:           'owner',
          active:         true,
          passwordHash,
        });
      }

      return res.json({
        ok:             true,
        userId:         String(user._id),
        organizationId: String(org._id),
        phone:          normalizedPhone,
        message:        'Usuário criado/atualizado. Faça login agora.',
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });


  // ── Envio de mídia pelo atendente ────────────────────────────────────────
  router.post('/api/v1/conversations/:id/messages/media', requireOrganization, async (req, res) => {
    try {
      const { uploadToR2 } = await import('../services/storage/r2-storage.service.js');

      const conversation = await Conversation.findOne({ _id: req.params.id }).lean();
      if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

      const contact = await Contact.findById(conversation.contactId).lean();
      if (!contact) return res.status(404).json({ error: 'Contact not found' });

      const account = await WhatsAppAccount.findById(conversation.whatsappAccountId)
        .select('+credentials +accessTokenEncrypted +clientTokenEncrypted');
      if (!account) return res.status(404).json({ error: 'WhatsApp account not found' });

      // Parse multipart — espera campo 'file' (base64 ou buffer via JSON simples)
      const { fileBase64, mimeType, fileName, type, caption, replyToMessageId } = req.body;
      if (!fileBase64 || !mimeType) return res.status(400).json({ error: 'fileBase64 e mimeType obrigatórios' });

      const buffer = Buffer.from(fileBase64, 'base64');
      const msgIdTemp = new (await import('mongoose')).default.Types.ObjectId();

      const r2Result = await uploadToR2({
        organizationId: conversation.organizationId,
        conversationId: conversation._id,
        messageId:      String(msgIdTemp),
        buffer,
        mimeType,
        fileName:       fileName || 'media',
        type:           type || 'document',
      });

      if (!r2Result) return res.status(500).json({ error: 'Falha no upload para R2' });

      // Envia via provider
      const { getWhatsAppProvider } = await import('../providers/whatsapp/index.js');
      const provider = getWhatsAppProvider(account.toObject());
      let sendResult;
      const mediaType = type || 'document';
      const url = r2Result.url;

      try {
        if (mediaType === 'image')    sendResult = await provider.sendImage(contact.phone, { link: url, caption });
        else if (mediaType === 'audio') sendResult = await provider.sendAudio(contact.phone, { link: url });
        else                           sendResult = await provider.sendDocument(contact.phone, { link: url, filename: fileName });
      } catch (sendErr) {
        console.error('[Media] send error:', sendErr.message);
        return res.status(502).json({ error: 'Erro ao enviar pelo WhatsApp: ' + sendErr.message });
      }

      const msg = await Message.create({
        organizationId:    conversation.organizationId,
        whatsappAccountId: account._id,
        contactId:         contact._id,
        conversationId:    conversation._id,
        provider:          account.provider,
        providerMessageId: sendResult?.messageId || sendResult?.messages?.[0]?.id || ('out-' + Date.now()),
        direction:         'outbound',
        type:              mediaType,
        text:              caption || '',
        media:             { ...r2Result, caption },
        status:            'sent',
        aiGenerated:       false,
        source:            'human',
        occurredAt:        new Date(),
        replyToMessageId:  replyToMessageId || null,
      });

      await Conversation.updateOne(
        { _id: conversation._id },
        { $set: { lastMessageAt: new Date(), lastMessagePreview: caption || '[mídia]' } }
      );

      res.status(201).json({ data: msg });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
