# Changelog — Agora Bot 2

> Nome do arquivo mantido por compatibilidade documental. O Agora Bot 2 **não** está conectado ao Agora Cortex.

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
