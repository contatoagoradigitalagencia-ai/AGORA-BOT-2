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

## Primeiro usuário admin

Com MongoDB configurado em `.env`:

```bash
export ADMIN_PASSWORD='sua-senha-forte'
npm run create-admin
```

Isso cria/atualiza em `Agorabot2.users`:

- Ramon — `5521971107509` — `admin@agoradigital.com.br` — role `owner`

Login no frontend:

```bash
curl -X POST http://localhost:3000/login \
  -H 'Content-Type: application/json' \
  -d '{"phone":"5521971107509","password":"sua-senha-forte"}'
```

Banco oficial:

- Cluster: `AgoraBOT`
- Database: `Agorabot2`

## Rotas principais

- `POST /login`
- `GET /health`
- `GET /webhook/meta`
- `POST /webhook/meta`
- `POST /webhook/zapi`
- `GET /webhook` e `POST /webhook` como alias legado Meta
- APIs internas em `/api/v1/*`

## Segurança

Segredos ficam no backend e, quando `ENCRYPTION_KEY` está configurada, tokens são gravados criptografados no MongoDB.

Nunca commitar `.env`. O banco legado `whatsapp` **não** é utilizado — apenas `Agorabot2`.

## Frontend

Painel oficial: [AGORA-BOT](https://github.com/contatoagoradigitalagencia-ai/AGORA-BOT)

## Deploy

1. Crie o serviço Node 20+ (Railway, Render, Fly.io, VPS).
2. Configure todas as variáveis de `.env.example`.
3. Exponha a porta `PORT` (padrão `3000`).
4. Health check: `GET /health`.
5. Configure webhooks Meta/Z-API para `https://<seu-dominio>/webhook/meta` e `/webhook/zapi`.
6. Aponte o frontend `VITE_URL_BACK_END` para a URL pública desta API.

Documentação: `PROGRAMAS_INFO.md`, `ARQUITETURA.md`, `BANCO_DE_DADOS.md`, `APIS.md`, `MODULOS.md`, `REGRAS_DE_SEGURANCA.md`.
