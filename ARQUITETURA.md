# Arquitetura — Agora Bot 2

## Princípios

- Standalone: não depende do Cortex.
- Multiempresa por `organizationId`.
- Providers WhatsApp isolados.
- IA isolada em `services/ai`.
- Catálogo interno em MongoDB.
- Segredos não expostos no frontend.

## Fluxo de mensagem

```text
Webhook Meta/Z-API
↓
Provider normalizeWebhook()
↓
processNormalizedEvent()
↓
MongoDB: contacts/conversations/messages
↓
BotConfig + Catalog + Prompt
↓
Groq
↓
getWhatsAppProvider()
↓
provider.sendText()
↓
MongoDB: messages outbound + metrics
```

## Módulos

- `models`: schemas Mongoose oficiais.
- `providers/whatsapp`: Meta e Z-API.
- `services/ingestion`: persistência e orquestração de mensagens.
- `services/bot`: decisão de IA e handoff humano.
- `services/catalog`: consulta produtos, serviços, planos e base de conhecimento.
- `services/ai`: Groq.
- `routes`: webhooks e APIs internas.
