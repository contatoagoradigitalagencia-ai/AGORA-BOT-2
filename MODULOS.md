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

## Observabilidade

- `metrics`, `logs`, `errors` — logger mascara campos sensíveis.

## Socket.IO (`src/socket`)

Eventos em tempo real para o frontend AGORA-BOT (mensagens, filas, status).
