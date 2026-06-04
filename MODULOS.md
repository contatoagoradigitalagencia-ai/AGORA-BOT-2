# Módulos — Agora Bot 2

## WhatsApp Providers

Contrato esperado:

- `sendText(to, text)`
- `sendImage(to, payload)`
- `sendAudio(to, payload)`
- `sendDocument(to, payload)`

Toda regra de negócio deve usar `getWhatsAppProvider(account)`.

## IA

- Serviço: `services/ai/groq.service.js`
- Modelo padrão: `llama-3.3-70b-versatile`
- A IA não conhece detalhes de provider WhatsApp.

## Catálogo

Collections usadas pela IA:

- `products`
- `services`
- `plans`
- `knowledge_base`

Google Sheets não é fonte principal nesta arquitetura.

## Atendimento humano

- `human_queue`
- `Conversation.humanRequired`
- Palavras-chave configuráveis em `bot_configs.humanHandoffKeywords`
