# Banco de Dados — Agora Bot 2

## Banco oficial

- Cluster: `AgoraBOT`
- Database: `Agorabot2`

O runtime valida `MONGODB_DB_NAME=Agorabot2` para reduzir risco de escrever no banco legado.

## Collections oficiais

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

Entidades operacionais possuem `organizationId` obrigatório:

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

## Banco legado

Nenhuma collection do banco legado `whatsapp` é criada ou alterada por esta base.
