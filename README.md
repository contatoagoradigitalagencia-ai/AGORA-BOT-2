# Agora Bot 2

Backend standalone para atendimento WhatsApp multiempresa com MongoDB Atlas, Meta WhatsApp Cloud API, Z-API, IA Groq, catálogo interno e atendimento humano.

Este projeto **não depende do Agora Cortex**. A arquitetura foi preparada para operar de forma independente.

## Stack

- Node.js 20+
- Express
- MongoDB Atlas + Mongoose
- Socket.IO
- Groq `llama-3.3-70b-versatile`
- Meta WhatsApp Cloud API
- Z-API

## Rodar localmente

```bash
cp .env.example .env
npm install
npm run build
npm run test
npm run dev
```

Banco oficial:

- Cluster: `AgoraBOT`
- Database: `Agorabot2`

## Rotas principais

- `GET /health`
- `GET /webhook/meta`
- `POST /webhook/meta`
- `POST /webhook/zapi`
- `GET /webhook` e `POST /webhook` como alias legado Meta
- APIs internas em `/api/v1/*`

## Segurança

Segredos ficam no backend e, quando `ENCRYPTION_KEY` está configurada, tokens são gravados criptografados no MongoDB.
