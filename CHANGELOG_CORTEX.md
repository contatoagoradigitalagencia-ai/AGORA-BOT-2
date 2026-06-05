# Changelog — Agora Bot 2

> Nome do arquivo mantido por compatibilidade documental. O Agora Bot 2 **não** está conectado ao Agora Cortex.

## 2026-06-05 — Correção de imagem e vídeo Z-API

### Módulos afetados

`normalize.js`, `message-ingestion.service.js`, `media-download.service.js`, `socket/index.js`

### Problema

Imagem e vídeo com legenda podiam ser classificados como `text`, porque o normalizador verificava `payload.text` antes de `payload.image` e `payload.video`. Com isso o pipeline R2 não era acionado e o frontend recebia mídia sem URL renderizável.

### Solução

- Prioridade de detecção ajustada: imagem, áudio, documento, vídeo/GIF e sticker são detectados antes de texto.
- Normalização de imagem e vídeo agora preserva `providerUrl`, `url`, `link`, `mimeType`, `fileName`, `caption`, `thumbnailUrl`, `duration` e `isGif`.
- Downloader de mídia agora procura URL em `url`, `link`, `providerUrl`, `mediaUrl`, `fileUrl`, `imageUrl`, `videoUrl`, `gifUrl` e objetos `media`.
- Socket passa a entregar `message.media.url` e `message.data.image/video.url` de forma consistente.
- Logs de mídia não imprimem URLs completas por padrão; debug de payload bruto fica atrás de `MEDIA_DEBUG=true`.

### Como testar

```bash
npm test
npm run build
```

---

## 2026-06-04 — Rearquitetura Híbrida: Redução 80-95% de Tokens

### Módulos afetados
`bot-response.service.js`, `catalog.service.js`, `message-ingestion.service.js`, `internal.routes.js`

### Novos módulos
- `src/services/intent/intent-router.js` — Classificador local de intenção (sem IA)
- `src/services/rules/rule-engine.js` — Motor de regras local
- `src/services/rules/faq.service.js` — FAQ local + model Faq
- `src/services/cache/cache.service.js` — Cache in-memory com TTL
- `src/services/context/context-builder.js` — Context Builder (máx 10 eventos)
- `src/services/profile/contact-profile.service.js` — Perfil e lead score do contato
- `src/services/metrics/metrics.service.js` — Métricas de economia de tokens

### Novo fluxo
```
Mensagem → Intent Router → Rule Engine → Resposta Local (sem Groq)
                        ↘ (intent: sales/objection/unknown) → IA com contexto mínimo
```

### Estimativa de ganho
- 80-95% menos chamadas ao Groq
- Latência de respostas locais: <50ms vs ~2000ms com IA
- Novo endpoint GET /api/v1/metrics/bot para acompanhar economia em tempo real

### Novos endpoints
- `GET /api/v1/metrics/bot` — dashboard de economia
- `GET/POST/PATCH/DELETE /api/v1/faq` — CRUD de FAQ local
- `DELETE /api/v1/products/:id`, `/services/:id`, `/plans/:id` — delete de catálogo

### Compatibilidade
- Z-API: mantida integralmente
- Meta Cloud API: mantida integralmente
- multiempresa por organizationId: mantida
- `shouldSendToHuman` e `getBotConfig`: mantidos com mesma assinatura

## 2026-06-04 — Trava anti-flood e configuracao do Bot

### Módulo

Webhook + ingestao + configuracao interna

### Problema

Mensagens reais da Z-API podiam acionar respostas automáticas sem uma trava central de pausa, com risco de loop por mensagens do proprio bot, callbacks de status ou duplicidade de `providerMessageId`.

### Solução

- `processNormalizedEvent` agora ignora eventos `fromMe`, `fromApi`, `outbound`, `message.status` e callbacks `SENT/RECEIVED/READ`.
- Resposta automatica so ocorre quando `whatsappAccount.settings.autoReply === true`.
- Com `autoReply === false`, a mensagem inbound e salva em `contacts`, `conversations` e `messages`, mas a IA nao e chamada e nenhuma resposta e enviada.
- Trava por `whatsappAccountId + provider + providerMessageId` evita responder duas vezes a mesma mensagem.
- Novo endpoint `PATCH /api/v1/whatsapp-accounts/:id/settings`.
- Novos endpoints de configuracao: `GET/PATCH /api/v1/bot-config`, com suporte aos prompts ja existentes.

### Como testar

```bash
npm test
curl -X PATCH http://localhost:3000/api/v1/whatsapp-accounts/<id>/settings \
  -H 'Authorization: Bearer <token>' \
  -H 'x-organization-id: <organizationId>' \
  -H 'Content-Type: application/json' \
  -d '{"autoReply":false}'
```

---

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
