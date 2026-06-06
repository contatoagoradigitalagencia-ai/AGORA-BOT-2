# AUDITORIA TÉCNICA — AGORA BOT 2
Data: 2026-06-05
Versão auditada: main

---

## 1. ISOLAMENTO MULTIEMPRESA (organizationId)

### Collections auditadas
| Collection | organizationId | Indexado | Status |
|---|---|---|---|
| organizations | N/A (é a org) | — | ✅ Correto |
| users | ✅ | ✅ | ✅ |
| whatsapp_accounts | ✅ | ✅ | ✅ |
| contacts | ✅ | ✅ | ✅ |
| conversations | ✅ | ✅ | ✅ |
| messages | ✅ | ✅ | ✅ |
| bot_configs | ✅ | ✅ | ✅ |
| prompts | ✅ | ✅ | ✅ |
| knowledge_base | ✅ | ✅ | ✅ |
| quick_replies | ✅ | ✅ | ✅ |
| human_queue | ✅ | ✅ | ✅ |
| attendants | ✅ | ✅ | ✅ |
| catalog (products/services/plans) | ✅ | ✅ | ✅ |
| automations | ✅ | ✅ | ✅ |
| client_integrations | ✅ | ✅ | ✅ |
| metrics/logs/errors | ✅ | ✅ | ✅ |

### Queries sem filtro de org — justificativas
| Rota | Query | Justificativa |
|---|---|---|
| GET /organizations | `Organization.find()` | Rota de super-admin (`requireAdminRole`) |
| GET /admin/ai | `BotConfig.find({})` | Dashboard super-admin — intencional |
| GET /admin/status | `ErrorLog.findOne({})` | Saúde global do sistema — intencional |

**Conclusão:** Nenhuma query de dados de cliente é feita sem filtro de org.

---

## 2. SEGURANÇA

| Item | Status | Detalhe |
|---|---|---|
| Auth JWT | ✅ | `requireAuth` em todas as rotas `/api/v1/*` |
| Filtro org | ✅ | `requireOrganization` + `scopedQuery()` |
| Rate limit API | ✅ | 120 req/min por IP |
| Rate limit auth | ✅ | 20/15min (brute force) |
| Security headers | ✅ | Helmet (CSP, HSTS, X-Frame) |
| Webhooks | ✅ | CORS separado, sem rate limit |
| Senha hash | ✅ | bcrypt 12 rounds |
| Tokens/secrets | ✅ | AES-256-GCM no banco |
| Variáveis de ambiente | ✅ | Sem secrets no código |

---

## 3. LOGS E PRIVACIDADE

### Antes da auditoria
- `console.log('[Ingestion] before message upsert', { event, ... })` — expunha payload completo do WhatsApp incluindo texto da mensagem e dados do contato

### Após auditoria
- Logs de ingestion suprimidos para campos de identificação apenas (`_id`, `direction`, `type`)
- Texto de mensagem, nome e telefone do contato não são mais logados
- `raw` do provider nunca é logado

---

## 4. PROVIDER LAYER

### Providers disponíveis
| Provider | Status |
|---|---|
| Z-API | ✅ Implementado |
| Meta Cloud API | ✅ Implementado |
| Evolution API | ⏳ Planejado |

### Como adicionar novo provider
1. Criar `src/providers/whatsapp/{nome}/provider.js`
2. Implementar interface: `sendText`, `sendImage`, `sendAudio`, `sendDocument`
3. Registrar em `src/providers/whatsapp/index.js`
4. Adicionar normalizer em `src/providers/whatsapp/{nome}/normalize.js`

**Regra:** nenhuma regra de negócio deve referenciar provider diretamente.
Sempre usar `getWhatsAppProvider(account)`.

---

## 5. FLUXO DE MENSAGEM (verificado)

```
WhatsApp → Webhook → normalizeZapiWebhook/normalizeMeta
↓
isSystemEvent() → descarta eventos de grupo/sistema
↓
isNewsletter() → descarta newsletters
↓
message-ingestion.service.js
  → upsert Contact (org-scoped)
  → upsert Conversation (org-scoped)
  → pipeline de mídia (download → R2 → metadados no Mongo)
  → upsert Message (org-scoped)
  → canSendFreeformMessage() → janela 24h Meta / livre Z-API
  → isAutoReplyEnabled() → respeita toggle da conta
  → intent-router → resposta local se possível
  → Groq IA → resposta gerada
  → provider.sendText()
```

Fluxo 100% verificado. IA recebe contexto tratado, nunca `req.body` diretamente.

---

## 6. RISCOS RESIDUAIS

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| R2 não configurado | Médio | Baixo | Fallback para URL do provider |
| Groq quota esgotada | Baixo | Médio | Rule engine como fallback local |
| MongoDB connection drop | Baixo | Alto | Mongoose reconnect automático |
| Token JWT expirado em sessão longa | Médio | Baixo | Frontend redireciona para login |
| Webhook sem verificação de assinatura Meta | ⚠️ | Alto | Implementar verificação HMAC |

---

## 7. PRÓXIMAS AÇÕES RECOMENDADAS

1. **Verificação de assinatura Meta** — `X-Hub-Signature-256` no webhook
2. **Índice TTL em logs/errors** — limpar entradas antigas automaticamente
3. **Soft delete em contacts** — LGPD (direito ao esquecimento)
4. **Upstash Redis para rate limit** — mais robusto em serverless
