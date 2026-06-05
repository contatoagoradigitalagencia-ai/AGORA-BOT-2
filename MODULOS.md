# Módulos — Agora Bot 2

## WhatsApp Providers (`src/providers/whatsapp`)

Contrato unificado via `getWhatsAppProvider(account)`:

| Método | Uso |
|--------|-----|
| `sendText(to, text)` | Texto simples |
| `sendImage(to, payload)` | Imagem |
| `sendAudio(to, payload)` | Áudio |
| `sendDocument(to, payload)` | Documento |
| `normalizeWebhook(body)` | Ingestão inbound |

Implementações:

- **Meta** — `meta/provider.js`, `meta/normalize.js`
- **Z-API** — `zapi/provider.js`, `zapi/normalize.js`

Credenciais por conta ficam em `whatsapp_accounts` (tokens criptografados).

## Ingestão (`src/services/ingestion`)

- Normaliza eventos dos providers.
- Persiste em `contacts`, `conversations`, `messages` no banco **`Agorabot2`**.
- Ignora eventos de status, mensagens `fromMe`, `fromApi`, outbound e duplicidade por `providerMessageId`.
- Respeita `whatsapp_accounts.settings.autoReply`: se estiver `false`, salva a mensagem inbound e encerra sem IA e sem resposta.
- Dispara fluxo de bot e fila humana quando aplicável.

## Bot (`src/services/bot`)

- Lê `bot_configs`, `prompts`, catálogo.
- Aciona Groq para resposta automática.
- Handoff para `human_queue` quando `humanRequired` ou palavras-chave configuradas.

## IA (`src/services/ai/groq.service.js`)

- Modelo padrão: `llama-3.3-70b-versatile` (`GROQ_MODEL`).
- Sem dependência de provider WhatsApp na camada de prompt.

## Catálogo (`src/services/catalog`)

Collections:

- `products`, `services`, `plans`, `knowledge_base`

Google Sheets **não** é fonte principal nesta arquitetura.

## Atendimento humano

- Collection `human_queue`
- Flag `Conversation.humanRequired`
- Palavras-chave em `bot_configs.humanHandoffKeywords`

## Admin multiempresa

- Rotas em `/api/v1/admin/*` protegidas por JWT com `role=owner|admin`.
- CRUD de `organizations` com inativação em vez de remoção destrutiva.
- Gestão de `client_integrations` para Meta e Z-API.
- Teste de conexão server-side e ativação operacional em `whatsapp_accounts`.
- Sincronização de integração e reinício interno de webhook.
- Aba IA para modelo, temperatura, limite diário, tokens, erros, restart e teste de prompt.
- Monitoramento de MongoDB, Socket.IO, Cloudflare R2, Groq, Meta e Z-API.
- Logs administrativos normalizados com filtros por período, organização, tipo e provider.
- Dashboard administrativo lê métricas de `organizations`, `client_integrations`, `whatsapp_accounts`, `conversations`, `messages`, `logs` e `errors`.

`client_integrations` é a camada administrativa de cadastro; `whatsapp_accounts` é a camada operacional consumida pelo webhook, ingestão e providers.

## Observabilidade

- `metrics`, `logs`, `errors` — logger mascara campos sensíveis.

## Socket.IO (`src/socket`)

Eventos em tempo real para o frontend AGORA-BOT (mensagens, filas, status).
