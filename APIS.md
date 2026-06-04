# APIs — Agora Bot 2

## Públicas

### `GET /health`
Retorna status da API e conexão MongoDB.

### `GET /webhook/meta`
Verificação da Meta WhatsApp Cloud API.

### `POST /webhook/meta`
Recebe mensagens/statuses da Meta.

### `POST /webhook/zapi`
Recebe mensagens/statuses da Z-API.

### Alias legado

- `GET /webhook`
- `POST /webhook`

Mantidos para compatibilidade com integrações Meta existentes.

## Internas

Todas exigem uma das opções:

- `Authorization: Bearer <jwt>`
- `x-api-key: <INTERNAL_API_TOKEN>`

E, quando aplicável:

- `x-organization-id: <organizationId>`

Rotas:

- `GET/POST /api/v1/organizations`
- `POST /api/v1/users`
- `GET/POST /api/v1/whatsapp-accounts`
- `POST /api/v1/whatsapp-accounts/:id/send-text`
- `GET/POST/PATCH /api/v1/products`
- `GET/POST/PATCH /api/v1/services`
- `GET/POST/PATCH /api/v1/plans`
- `GET/POST/PATCH /api/v1/bot_configs`
- `GET/POST/PATCH /api/v1/prompts`
- `GET/POST/PATCH /api/v1/knowledge_base`
- `GET/POST/PATCH /api/v1/quick_replies`
- `GET /api/v1/conversations`
- `GET /api/v1/contacts`
- `GET /api/v1/messages`
- `GET /api/v1/human-queue`
