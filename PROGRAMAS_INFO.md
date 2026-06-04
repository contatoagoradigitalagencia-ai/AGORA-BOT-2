# Programas Info — Agora Bot 2

## Objetivo

O **Agora Bot 2** é a API oficial de atendimento WhatsApp multiempresa, publicada no repositório [AGORA-BOT-2](https://github.com/contatoagoradigitalagencia-ai/AGORA-BOT-2).

O painel operacional fica no repositório separado [AGORA-BOT](https://github.com/contatoagoradigitalagencia-ai/AGORA-BOT) (frontend Vite/React).

## Separação de repositórios

| Camada | Repositório | Stack |
|--------|-------------|--------|
| Frontend | AGORA-BOT | Vite, React, Socket.IO client |
| Backend | AGORA-BOT-2 | Node 20+, Express 5, Mongoose |
| Banco oficial | MongoDB Atlas `Agorabot2` | Cluster `AgoraBOT` |

## Escopo desta versão (0.1.0)

- Backend standalone (sem Agora Cortex).
- MongoDB Atlas exclusivamente em `Agorabot2` (validação em runtime).
- Meta WhatsApp Cloud API e Z-API como providers.
- Groq como IA oficial.
- Catálogo interno (`products`, `services`, `plans`, `knowledge_base`).
- Atendimento humano (`human_queue`).
- Socket.IO para eventos em tempo real.
- APIs internas `/api/v1/*` com JWT ou `x-api-key`.

## Fora do escopo

- Alterar ou migrar o banco legado `whatsapp`.
- Commitar `.env` ou tokens reais.
- Lógica de UI no backend.

## Como testar localmente

```bash
cp .env.example .env
# Preencha MONGODB_URI, JWT_SECRET, etc.
npm install
npm run build
npm test
npm run dev
```

Frontend: aponte `VITE_URL_BACK_END` para esta API (ex.: `http://localhost:3000`).
