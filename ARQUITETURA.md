# Arquitetura — Agora Bot 2

## Visão geral

```text
┌─────────────────┐     HTTPS/WS      ┌──────────────────┐
│  AGORA-BOT      │ ◄──────────────► │  AGORA-BOT-2     │
│  (Vite/React)   │   JWT / cookies  │  Express + IO    │
└─────────────────┘                   └────────┬─────────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    ▼                          ▼                          ▼
            MongoDB Agorabot2          Meta Cloud API                 Z-API
            (oficial)                  (webhook/send)            (webhook/send)
                    │
                    ▼
                 Groq API
```

## Princípios

- **Standalone:** não depende do Cortex nem do monorepo Nexus.
- **Multiempresa:** `organizationId` em todas as entidades operacionais.
- **Providers isolados:** Meta e Z-API em `src/providers/whatsapp/`.
- **IA isolada:** `src/services/ai/` — sem acoplamento a provider WhatsApp.
- **Banco único oficial:** `MONGODB_DB_NAME=Agorabot2` (bloqueio em `assertRuntimeEnv`).
- **Segredos no servidor:** nunca expor tokens ao frontend.

## Fluxo de mensagem inbound

```text
Webhook Meta ou Z-API
        ↓
normalizeWebhook() (provider)
        ↓
processNormalizedEvent() (ingestion)
        ↓
MongoDB Agorabot2: contacts → conversations → messages
        ↓
BotConfig + Catalog + Prompt
        ↓
Groq (services/ai)
        ↓
getWhatsAppProvider(account)
        ↓
provider.sendText() / mídia
        ↓
Persistência outbound + metrics/logs
        ↓
Socket.IO (eventos para o frontend)
```

## Fluxo administrativo

```text
Owner/Admin no AGORA-BOT
        ↓
JWT com role owner/admin
        ↓
/api/v1/admin/*
        ↓
organizations + client_integrations + logs/errors
        ↓
Ativar integração
        ↓
whatsapp_accounts operacional
        ↓
Webhooks Meta/Z-API usam a conta ativa
```

`client_integrations` é cadastro administrativo; `whatsapp_accounts` é execução real do bot. Essa separação evita misturar tokens no frontend e mantém compatibilidade com os webhooks validados.

## Estrutura de pastas

| Pasta | Responsabilidade |
|-------|------------------|
| `src/config` | Env, CORS |
| `src/db` | Conexão Mongoose (`dbName: Agorabot2`) |
| `src/models` | Schemas oficiais |
| `src/providers/whatsapp` | Meta + Z-API |
| `src/services/ingestion` | Persistência de mensagens |
| `src/services/bot` | Resposta IA e handoff humano |
| `src/services/catalog` | Produtos, serviços, planos |
| `src/routes` | Health, webhooks, `/api/v1` |
| `src/middleware` | Auth JWT, organização e Admin (`owner/admin`) |
| `src/socket` | Socket.IO |

## Deploy recomendado

- **Runtime:** Node 20+ (Railway, Render, Fly.io, VPS, etc.).
- **Variáveis:** ver `.env.example`.
- **Health check:** `GET /health`.
- **Webhooks públicos:** `POST /webhook/meta`, `POST /webhook/zapi`.
