# Changelog — Agora Bot 2

> Nome do arquivo mantido por compatibilidade documental. O Agora Bot 2 **não** está conectado ao Agora Cortex.

## 2026-06-04 — CORS webhooks Z-API / Meta

### Módulo

Config CORS

### Problema

`POST /webhook/zapi` bloqueado com `CORS blocked: https://api.z-api.io`.

### Solução

- Webhooks montados antes do CORS restrito do painel.
- `webhookCorsMiddleware` permissivo em `/webhook`, `/webhook/meta`, `/webhook/zapi`.
- `https://api.z-api.io` e `https://agora-bot.vercel.app` na lista do painel.

### Como testar

```bash
curl -X POST http://localhost:3000/webhook/zapi \
  -H 'Origin: https://api.z-api.io' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

---

## 2026-06-04 — Autenticação por telefone

### Módulo

Auth + seed admin

### Problema

Frontend AGORA-BOT faz login com telefone/senha em `POST /login`, mas a API não expunha essa rota nem o schema `users` alinhado.

### Solução

- Model `users` com `phone`, `passwordHash`, `active`, `organizationId`, timestamps.
- Rota pública `POST /login` (bcrypt + JWT, retorno `idPhone` + `token`).
- Script `npm run create-admin` com `ADMIN_PASSWORD`.

### Arquivos alterados

- `src/models/user.model.js`, `src/routes/auth.routes.js`, `src/services/auth/auth.service.js`
- `scripts/create-admin.js`, `src/app.js`, `scripts/smoke-test.js`, documentação

### Como testar

```bash
export ADMIN_PASSWORD='...'
npm run create-admin
curl -X POST http://localhost:3000/login -H 'Content-Type: application/json' \
  -d '{"phone":"5521971107509","password":"..."}'
```

---

## 2026-06-04 — Publicação oficial AGORA-BOT-2

### Módulo

Repositório backend + documentação

### Problema

API standalone existia apenas em pacote local; frontend já publicado em AGORA-BOT sem backend versionado alinhado no GitHub.

### Solução

- Publicação da base Node/Express no repositório `contatoagoradigitalagencia-ai/AGORA-BOT-2`.
- Documentação atualizada (arquitetura, banco `Agorabot2`, APIs, segurança).
- Confirmação explícita: banco legado `whatsapp` fora de escopo.

### Arquivos alterados

- `PROGRAMAS_INFO.md`, `ARQUITETURA.md`, `BANCO_DE_DADOS.md`, `APIS.md`, `MODULOS.md`, `REGRAS_DE_SEGURANCA.md`, `CHANGELOG_CORTEX.md`

### Como testar

```bash
cp .env.example .env
npm install
npm run build
npm run lint
npm test
npm run dev
```

### Validações executadas na publicação

- `npm run build` — syntax check 39 arquivos OK
- `npm run lint` — OK
- `npm test` — smoke tests OK
- `npm start` — falha esperada sem `MONGODB_URI` (guard de env)

---

## 0.1.0

- Base standalone Express + MongoDB Atlas + Mongoose.
- Providers Meta e Z-API.
- Groq como camada de IA.
- Catálogo interno MongoDB.
- Fila de atendimento humano.
- Socket.IO e APIs `/api/v1`.
