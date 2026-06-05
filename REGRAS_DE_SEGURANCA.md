# Regras de Segurança — Agora Bot 2

## Nunca commitar

- `.env`, `.env.local`, `.env.production`
- Tokens Meta, Z-API, Groq
- `JWT_SECRET`, `INTERNAL_API_TOKEN`, `ENCRYPTION_KEY`
- URIs MongoDB com usuário/senha reais

Use apenas `.env.example` no repositório.

## Banco de dados

- **Usar somente** `MONGODB_DB_NAME=Agorabot2`.
- **Proibido** apontar esta API para o banco legado `whatsapp`.
- O runtime valida o nome do banco antes de conectar.

## Segredos em trânsito e repouso

| Dado | Tratamento |
|------|------------|
| `accessToken` / `clientToken` WhatsApp | Gravados como `*Encrypted` (AES-256-GCM se `ENCRYPTION_KEY` ≥ 32 bytes) |
| JWT | Apenas no header `Authorization` |
| API interna | `x-api-key` = `INTERNAL_API_TOKEN` |

## Autenticação

Rotas `/api/v1/*` exigem JWT válido **ou** `x-api-key` correto.

Nunca consultar dados operacionais sem `organizationId` quando a rota for multiempresa.

Rotas `/api/v1/admin/*` exigem papel `owner` ou `admin`. O frontend pode esconder a tela Admin para outros papéis, mas a proteção obrigatória fica no backend.

`client_integrations` guarda tokens com `select:false` e criptografia via `encryptSecret`. Listagens administrativas retornam apenas metadados e máscaras, nunca o valor real do token.

Ao ativar uma integração, o backend copia credenciais criptografadas para `whatsapp_accounts`; o browser nunca recebe token Meta, Z-API, Groq, JWT secret ou chave de criptografia.

## Logs

O logger **não** deve registrar tokens, senhas ou chaves. Campos sensíveis são mascarados por nome.

## Frontend

O repositório AGORA-BOT não deve receber:

- `GROQ_API_KEY`
- Tokens Meta/Z-API
- `JWT_SECRET` de produção

Apenas URL pública da API (`VITE_URL_BACK_END`).

## Integrações externas

- **Meta API** e **Z-API:** alterações apenas neste backend, via providers.
- **MongoDB:** apenas cluster oficial `Agorabot2`.
- **Groq:** apenas server-side.
