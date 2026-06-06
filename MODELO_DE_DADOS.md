# MODELO DE DADOS — AGORA BOT 2

## Hierarquia de Isolamento
```
Organization
└── WhatsAppAccount (provider: zapi | meta)
    └── Contact (phone, name, org-scoped)
        └── Conversation (status, humanRequired, aiEnabled)
            └── Message (type, direction, media, source)
└── BotConfig (autoReply, prompts, settings)
└── KnowledgeBase (vetores de contexto, org-scoped)
└── Attendant (identificador sem senha)
└── HumanQueue (fila de atendimento)
└── Catalog → Product | Service | Plan
└── ClientIntegration (credenciais Meta/Z-API por cliente)
```

## Campos obrigatórios em todas as collections de dados
- `organizationId` — ObjectId referenciando Organization
- `createdAt` / `updatedAt` — timestamps automáticos

## Índices críticos
- `messages`: `{ conversationId: 1, occurredAt: -1 }` + `{ providerMessageId: 1 }` (unique)
- `conversations`: `{ contactId: 1 }` + `{ organizationId: 1, humanRequired: 1 }`
- `contacts`: `{ phone: 1, organizationId: 1 }` (unique por org)

## Campos sensíveis (nunca retornar em respostas)
- `passwordHash` (users) — `select: false`
- `accessTokenEncrypted` (whatsapp_accounts) — AES-256-GCM
- `metaAccessToken`, `zapiInstanceToken` (client_integrations) — AES-256-GCM
