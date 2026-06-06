# AUDITORIA DE PRODUÇÃO — AGORA BOT 2
**Data:** 2026-06-05  
**Versão:** main @ 0001c7e  
**Auditor:** Agora Digital / Claude  

---

## Resumo Executivo

O Agora Bot 2 possui fundação sólida para um SaaS multi-empresa de atendimento WhatsApp. A arquitetura está correta, o isolamento multi-tenant está implementado e os fluxos principais funcionam. Os problemas encontrados são médios e baixos — nenhum quebra produção imediatamente, mas alguns precisam ser resolvidos antes de escalar para 50+ clientes.

**Nota Geral: 7.2/10**

---

## 1. Arquitetura

### Problemas

| Severidade | Problema | Arquivo | Impacto |
|---|---|---|---|
| 🟡 Médio | `internal.routes.js` com 55 rotas em 1.618 linhas — God File | `src/routes/internal.routes.js` | Manutenção difícil, risco de conflito |
| 🟡 Médio | 27 `console.log` raw em vez de `safeLog` | Vários arquivos | Dados podem vazar em produção |
| 🟡 Médio | `intent-router.js` sem cache de resultado | `services/intent/` | Regex executada em todo request |
| 🟢 Baixo | `catalog.service.js` sem `.limit()` em 5 queries | `services/catalog/` | Pode retornar N ilimitado |

### O que está correto
- Separação clara: routes / services / providers / models / socket / middleware
- Providers desacoplados via `getWhatsAppProvider()` — troca de provider sem alterar negócio
- Sem dependências circulares detectadas
- `scopedQuery()` centraliza filtro de org

---

## 2. Segurança

### Status
| Item | Status | Detalhe |
|---|---|---|
| JWT auth | ✅ | `requireAuth` em toda `/api/v1/*` |
| Isolamento multi-empresa | ✅ | `requireOrganization` + `scopedQuery()` |
| Role-based access | ✅ | `requireAdminRole` em 22 rotas admin |
| Helmet / headers | ✅ | CSP, HSTS, X-Frame, X-Content-Type |
| Rate limit API | ✅ | 120 req/min por IP |
| Rate limit auth | ✅ | 20/15min por IP |
| Credentials criptografadas | ✅ | AES-256-GCM no Mongo |
| Meta HMAC webhook | ✅ | `verifyMetaSignature()` implementado |
| passwordHash protegido | ✅ | `select: false` no schema |
| Logs sem PII | ✅ | Payload raw não logado |

### Problemas

| Severidade | Problema | Impacto |
|---|---|---|
| 🟡 Médio | Socket.IO sem autenticação JWT — apenas `organizationId` do handshake | Usuário pode conectar com org de outro cliente se souber o ID |
| 🟡 Médio | URLs do R2 são públicas permanentes — sem expiração | Arquivo deletado do Mongo ainda acessível via URL |
| 🟢 Baixo | `console.log('[Ingestion] autoReply paused', { event, ... })` ainda loga `event` completo | Linha 407 — texto da mensagem pode aparecer no log |

---

## 3. WhatsApp

| Funcionalidade | Status | Detalhe |
|---|---|---|
| Webhook Z-API | ✅ | Recebe e processa |
| Webhook Meta | ✅ | Com HMAC verification |
| Verificação Meta (GET) | ✅ | verify_token por conta |
| Inbound texto | ✅ | |
| Inbound mídia | ✅ | Download + R2 |
| Newsletter block | ✅ | 6 campos verificados |
| Eventos sistema grupo | ✅ | 25+ tipos filtrados |
| Grupos (groupReplyMode) | ✅ | never/mention/always |
| Janela 24h Meta | ✅ | `canSendFreeformMessage()` |
| Z-API sem janela | ✅ | Livre |
| Outbound texto | ✅ | |
| Outbound mídia | ✅ | Via R2 URL |
| Templates Meta | ⚠️ | UI avisa, mas envio de template não implementado |
| Multi-conta por org | ✅ | |

---

## 4. Mídias

| Tipo | Recebe | R2 | Mongo | Frontend |
|---|---|---|---|---|
| Texto | ✅ | — | ✅ | ✅ |
| Imagem | ✅ | ✅ | metadata | ✅ |
| Áudio | ✅ | ✅ | metadata | ✅ player |
| Vídeo | ✅ | ✅ | metadata | ✅ |
| Documento | ✅ | ✅ | metadata | ✅ |
| Sticker | ✅ | ✅ | metadata | ✅ |

### Problemas

| Severidade | Problema |
|---|---|
| 🟡 Médio | `media-download.service.js` tem 1 `fetch()` sem timeout (linha ~60) |
| 🟡 Médio | `r2-storage.service.js` tem 1 `fetch()` sem timeout |
| 🟢 Baixo | R2 sem função de delete — arquivos órfãos acumulam se mensagem for deletada |
| 🟢 Baixo | Sem limpeza de mídias antigas (sem TTL) |

---

## 5. Atendimento Humano

| Funcionalidade | Status | Detalhe |
|---|---|---|
| Fila humana | ✅ | `human_queue` collection |
| Assumir conversa | ✅ | Seletor de atendente |
| Transferir | ✅ | Mesmo seletor |
| Encerrar + retornar IA | ✅ | `close-human` endpoint |
| Atendente salvo na conversa | ✅ | `assignedAttendantName` |
| Histórico preservado | ✅ | Mensagens não são deletadas |
| Auditoria de handoff | ⚠️ | Não há log de quem assumiu/transferiu com timestamp |
| Notas internas | ❌ | Não implementado |

---

## 6. IA e Intent Router

### Fluxo de decisão (verificado)
```
Mensagem recebida
↓ isSystemEvent? → descarta
↓ isNewsletter? → descarta
↓ isGroup sem menção? → descarta
↓ autoReply off? → salva, não responde
↓ keyword humano? → enfileira humano
↓ humanRequired? → não responde
↓ janela 24h? → bloqueia se Meta expirado
↓ intent router (15 intents, 30 patterns) → resposta local
↓ rule engine + FAQ → resposta local
↓ Groq IA → resposta gerada
```

### Métricas estimadas
- **Intent local**: ~30-40% das mensagens (saudação, preço, horário, cancelamento)
- **FAQ**: ~10-20% (se base de conhecimento populada)
- **Groq**: ~40-60% das mensagens que chegam até a IA

### Problemas

| Severidade | Problema |
|---|---|
| 🟡 Médio | Sem cache de respostas — mesma pergunta chama Groq múltiplas vezes |
| 🟡 Médio | Sem fallback se Groq retornar erro 429 (quota) ou timeout |
| 🟢 Baixo | `rule-engine.js` sem cases implementados — estrutura existe mas vazia |

---

## 7. Socket.IO

| Item | Status |
|---|---|
| Mensagens realtime | ✅ `chat:new_message` broadcast |
| 12 eventos implementados | ✅ |
| Auth por organizationId | ✅ |
| Disconnect handler | ❌ |
| Cleanup de listeners | ❌ |
| Room leave | ❌ |

### Problema crítico
Sem `socket.on('disconnect')`, cada conexão encerrada sem logout limpo deixa referências em memória. Em alto volume (100+ conexões simultâneas), isso causa **memory leak gradual** no processo Node.js.

---

## 8. MongoDB

### Índices: todos os models têm índices adequados ✅

| Model | Índices | Unique | TTL |
|---|---|---|---|
| messages | 10 | ✅ | ❌ |
| conversations | 9 | ✅ | ❌ |
| contacts | 5 | ✅ | ❌ |
| whatsapp_accounts | 10 | ✅ | ❌ |
| observability | 11 | — | ❌ |

### Problemas

| Severidade | Problema |
|---|---|
| 🟡 Médio | `internal.routes.js` tem 15 `find()` sem `.limit()` — risco de query lenta |
| 🟢 Baixo | Sem TTL em `logs/errors` — crescem indefinidamente |
| 🟢 Baixo | Sem TTL em `metrics` — acumula sem limpeza |

---

## 9. Cloudflare R2

| Funcionalidade | Status |
|---|---|
| Upload | ✅ |
| URLs públicas | ✅ |
| Fallback sem R2 | ✅ |
| Delete de objetos | ❌ |
| Listagem | ❌ |
| TTL/Expiração | ❌ |
| Presigned URLs | ❌ |

---

## 10. Admin Panel

| Seção | Status |
|---|---|
| Visão Geral | ✅ |
| Organizações | ✅ (`requireAdminRole`) |
| Integrações cliente | ✅ |
| Logs | ✅ |
| IA / AI Config | ✅ |
| Saúde do sistema | ✅ |
| Permissões por role | ✅ |

---

## 11. Performance

### Issues encontrados
| Severidade | Problema | Arquivo |
|---|---|---|
| 🟡 Médio | `catalog.service.js`: 5 `find()` sem `.limit()` | services/catalog/ |
| 🟡 Médio | `internal.routes.js`: 15 `find()` sem `.limit()` | routes/ |
| 🟡 Médio | `media-download.service.js`: fetch sem timeout | services/media/ |
| 🟡 Médio | `r2-storage.service.js`: fetch sem timeout | services/storage/ |
| 🟢 Baixo | Sem paginação em listagens longas (conversas, contatos) | routes/ |

---

## 12. Observabilidade

| Item | Status | Detalhe |
|---|---|---|
| Logs estruturados | ✅ | `safeLog()` / `safeError()` |
| Métricas de IA | ✅ | `metrics.service.js` |
| Error tracking | ✅ | `ErrorLog` collection |
| Health endpoint | ✅ | `/health` |
| APM externo | ❌ | Sem Datadog/New Relic/Sentry |
| Alertas | ❌ | Sem alertas automáticos |
| Tracing distribuído | ❌ | Sem OpenTelemetry |

---

## Bugs Críticos 🔴

Nenhum bug que quebre produção foi encontrado no estado atual.

---

## Bugs Médios 🟡

1. **Socket sem disconnect handler** — memory leak em volume alto
2. **URLs R2 públicas permanentes** — sem expiração
3. **JWT não verificado no Socket.IO** — apenas organizationId do handshake
4. **Sem fallback para Groq 429/timeout** — resposta falha silenciosamente
5. **15 queries sem `.limit()`** — risco de OOM com base grande
6. **2 fetch() sem timeout** — hang em falha de rede (mídia/R2)
7. **`autoReply paused` log** ainda expõe `event` completo (linha 407)

---

## Bugs Baixos 🟢

1. Sem TTL em logs/metrics — crescem indefinidamente
2. Sem delete no R2 — arquivos órfãos acumulam
3. `rule-engine.js` sem cases — estrutura vazia
4. Sem notas internas no atendimento humano
5. Sem auditoria de handoff com timestamp
6. Templates Meta: UI avisa mas envio não implementado
7. Sem paginação em listagens de contatos/conversas

---

## Recomendações por Prioridade

### Imediato (antes de 50 clientes)
1. Adicionar `socket.on('disconnect')` com cleanup de rooms
2. Adicionar `.limit()` nas queries principais
3. Adicionar timeout nos fetches de mídia e R2
4. Adicionar fallback para Groq: retry + mensagem de erro amigável

### Curto prazo (antes de 100 clientes)
5. Quebrar `internal.routes.js` em routers por domínio
6. Adicionar TTL index em `logs` e `metrics` (90 dias)
7. Implementar presigned URLs no R2 (privacidade)
8. Cache de respostas do intent router (Redis ou Map com TTL)
9. Autenticação JWT no handshake do Socket.IO

### Médio prazo
10. Templates Meta para iniciar conversas fora da janela 24h
11. Notas internas no atendimento humano
12. APM externo (Sentry ou similar)
13. Paginação em todas as listagens

---

## Avaliação por Dimensão

| Dimensão | Nota | Justificativa |
|---|---|---|
| Segurança | 8.5/10 | Auth sólido, HMAC, helmet, rate limit. Falta JWT no socket |
| Arquitetura | 7.0/10 | Boa separação, mas god file e sem cache |
| Escalabilidade | 6.5/10 | Sem limit em queries, memory leak no socket |
| Performance | 6.5/10 | Fetch sem timeout, sem paginação |
| Operação | 7.5/10 | Logs, métricas, health. Falta alertas |
| Experiência | 7.5/10 | Fluxo completo, mas sem templates Meta e notas |

**Nota Geral: 7.2/10**

---

## Capacidade Atual

| Escala | Pronto? | Bloqueio |
|---|---|---|
| ✅ 10 clientes | **SIM** | Nenhum bloqueio |
| ⚠️ 50 clientes | **COM RESSALVAS** | Resolver socket leak + queries sem limit |
| ❌ 100 clientes | **NÃO** | Socket leak, sem paginação, sem cache IA |
| ❌ 500 clientes | **NÃO** | Requer Redis, APM, arquitetura de workers |

---

## Roadmap Sugerido

### Fase 1 — Estabilização (1-2 semanas)
- [ ] Socket disconnect handler
- [ ] Limits em todas as queries
- [ ] Timeout nos fetches
- [ ] Fallback Groq
- [ ] Log line 407 corrigida

### Fase 2 — Escala (2-4 semanas)
- [ ] Quebrar internal.routes.js
- [ ] TTL em logs/metrics
- [ ] Cache de intent router
- [ ] Presigned URLs R2
- [ ] JWT no Socket.IO

### Fase 3 — Produto (1-2 meses)
- [ ] Templates Meta
- [ ] Notas internas
- [ ] Paginação
- [ ] APM/Sentry
- [ ] Alertas automáticos
