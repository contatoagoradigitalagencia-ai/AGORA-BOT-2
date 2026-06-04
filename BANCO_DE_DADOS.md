# Banco de Dados — Agora Bot 2

## Banco oficial (obrigatório)

| Item | Valor |
|------|--------|
| Cluster Atlas | `AgoraBOT` |
| Database | **`Agorabot2`** |
| Variável | `MONGODB_DB_NAME=Agorabot2` |

O arquivo `src/config/env.js` **rejeita** qualquer outro nome de banco em runtime:

```text
MONGODB_DB_NAME must be Agorabot2. Received: <outro>
```

A conexão Mongoose usa `dbName: env.mongodbDbName` em `src/db/mongoose.js`.

## Banco legado `whatsapp` — política

- O banco legado **`whatsapp` não é usado** por esta API.
- **Nenhuma** collection do banco `whatsapp` é criada, lida ou alterada por este projeto.
- Não configurar `MONGODB_DB_NAME=whatsapp`.
- Migrações do legado ficam fora do escopo do AGORA-BOT-2.

> Referências a `whatsapp` no código limitam-se ao produto Meta (`messaging_product: 'whatsapp'`) e à collection **`whatsapp_accounts`** dentro de `Agorabot2` — não ao banco legado.

## Collections oficiais (Agorabot2)

- `organizations`
- `users`
- `whatsapp_accounts`
- `contacts`
- `conversations`
- `messages`
- `products`
- `services`
- `plans`
- `bot_configs`
- `prompts`
- `knowledge_base`
- `quick_replies`
- `human_queue`
- `automations`
- `flows`
- `metrics`
- `logs`
- `errors`

## Multiempresa

Entidades operacionais exigem `organizationId`:

`whatsapp_accounts`, `contacts`, `conversations`, `messages`, `products`, `services`, `plans`, `bot_configs`, `prompts`, `knowledge_base`, `quick_replies`, `human_queue`, `automations`, `flows`, `metrics`, `logs`, `errors`.

## URI de conexão

Exemplo (sem credenciais reais):

```env
MONGODB_URI=mongodb+srv://USER:PASSWORD@HOST/?retryWrites=true&w=majority
MONGODB_DB_NAME=Agorabot2
```

O nome do database na URI **não substitui** `dbName` — o runtime força `Agorabot2`.
