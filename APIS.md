# APIs — Agora Bot 2

Base URL local padrão: `http://localhost:3000`

Prefixo interno: `/api/v1`

## Públicas (sem JWT)

### `POST /login`

Login do painel (telefone + senha). Compatível com o frontend AGORA-BOT.

**Body:**

```json
{
  "phone": "5521971107509",
  "password": "senha"
}
```

**Resposta `200`:**

```json
{
  "idPhone": "<organizationId>",
  "token": "<jwt>"
}
```

- `idPhone` é o `organizationId` usado pelo frontend nos cookies.
- `token` é JWT válido por 7 dias (`Authorization: Bearer`).
- Telefone é normalizado (apenas dígitos).
- Senha validada com **bcrypt** contra `users.passwordHash`.
- Usuário deve ter `active: true`.

**Erros:** `401` credenciais inválidas, `503` se `JWT_SECRET` não estiver configurado.

### `GET /health`

Status da API e conexão MongoDB (`Agorabot2`).

### `GET /webhook/meta`

Verificação do webhook Meta WhatsApp Cloud API (`hub.verify_token`).

### `POST /webhook/meta`

Recebe mensagens e statuses da Meta.

### `POST /webhook/zapi`

Recebe eventos da Z-API.

### Alias legado Meta

| Método | Rota |
|--------|------|
| GET | `/webhook` |
| POST | `/webhook` |

Compatibilidade com integrações que ainda apontam para `/webhook`.

## Internas (`/api/v1`)

Autenticação (uma das opções):

- `Authorization: Bearer <JWT>`
- `x-api-key: <INTERNAL_API_TOKEN>`

Quando aplicável:

- `x-organization-id: <organizationId>`

### Organização e usuários

- `GET /api/v1/organizations`
- `POST /api/v1/organizations`
- `GET /api/v1/me`
- `POST /api/v1/users`

`GET|POST /api/v1/organizations` é administrativo e exige papel `owner` ou `admin`.

### WhatsApp

- `GET /api/v1/whatsapp-accounts`
- `POST /api/v1/whatsapp-accounts`
- `PATCH /api/v1/whatsapp-accounts/:id/settings`
- `POST /api/v1/whatsapp-accounts/:id/send-text`

`PATCH /api/v1/whatsapp-accounts/:id/settings` atualiza configuracoes operacionais da conta, incluindo:

```json
{
  "autoReply": false
}
```

Quando `autoReply` e `false`, mensagens inbound sao salvas, mas a IA nao e chamada e nenhuma resposta automatica e enviada.

### Catálogo

- `GET|POST|PATCH /api/v1/products`
- `GET|POST|PATCH /api/v1/services`
- `GET|POST|PATCH /api/v1/plans`

### Bot e conhecimento

- `GET /api/v1/bot-config`
- `PATCH /api/v1/bot-config`
- `GET|POST|PATCH /api/v1/bot_configs`
- `GET|POST|PATCH /api/v1/prompts`
- `GET|POST|PATCH /api/v1/knowledge_base`
- `GET|POST|PATCH /api/v1/quick_replies`

### Operação

- `GET /api/v1/conversations`
- `GET /api/v1/contacts`
- `GET /api/v1/messages`
- `GET /api/v1/human-queue`

### Admin multiempresa

Rotas exclusivas para `owner/admin`:

- `GET /api/v1/admin/overview`
- `GET /api/v1/admin/organizations`
- `POST /api/v1/admin/organizations`
- `PATCH /api/v1/admin/organizations/:id`
- `DELETE /api/v1/admin/organizations/:id` (soft delete: inativa)
- `GET /api/v1/admin/integrations`
- `POST /api/v1/admin/integrations`
- `PATCH /api/v1/admin/integrations/:id`
- `DELETE /api/v1/admin/integrations/:id` (soft delete: inativa)
- `POST /api/v1/admin/integrations/:id/test`
- `POST /api/v1/admin/integrations/:id/activate`
- `GET /api/v1/admin/logs`

`activate` cria/atualiza `whatsapp_accounts` a partir de `client_integrations`, preservando tokens apenas no backend e deixando `settings.autoReply=false` por padrão.

## Integração com o frontend (AGORA-BOT)

O frontend consome esta API via `VITE_URL_BACK_END` (login, chats, contatos, atendimento humano, etc.).

Não chamar Meta/Z-API/Groq diretamente do browser — sempre via AGORA-BOT-2.

## Códigos de erro comuns

| Situação | Resposta |
|----------|----------|
| Sem auth em `/api/v1` | 401 |
| Organização ausente | 400 |
| Rota inexistente | 404 |
| Erro interno | 500 (sem vazar stack em produção) |
