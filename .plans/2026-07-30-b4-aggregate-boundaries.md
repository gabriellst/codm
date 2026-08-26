# Frente B4 — fronteiras de agregado (Thread absorve transcript e stop, ThreadStatusDeriver) — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle.

**Goal:** `Thread` passa a ser o dono real das invariantes de transcript (quem pode citar o quê, quem precisa de sender) e de stop (raise/resolve), com as duas sub-tabelas gravadas pelo agregado dentro da MESMA transação; `TranscriptRepository` e `StopRepository` morrem; o control-plane de stop (use cases, controllers, policy, evento, publisher e contratos) muda de contexto para `thread`; e a leitura de status derivado sai de três call sites duplicados para o serviço único `ThreadStatusDeriver`.

**Architecture:** Cinco cortes na ordem obrigatória. (1) O AGREGADO primeiro: `Thread.recordEntry` mint id + valida as duas invariantes (quotedEntry-da-mesma-thread via referência RESOLVIDA passada pelo chamador, e a matriz kind×sender) e acumula a entry pendente; nada de I/O na entidade, nada de hidratar histórico no load. (2) A PERSISTÊNCIA: `ThreadRepository.save(thread, tx)` dreno das escritas pendentes na mesma transação, e as leituras-filhas (`recentEntries`, `findEntry`, `openStops`, `findStop`) passam a ser a superfície do próprio agregado — o que mata `TranscriptRepository`/`StopRepository` sem inventar um segundo repositório de tabela-filha e resolve o estado compartilhado dos mocks em modo `mock`. (3) O BANCO: a definição de `stops` migra de `schema-sqlite/issue.ts` para `thread.ts` e `issue_id` fica nullable (recreate-table do dialeto sqlite), sem renomear o nome físico — ver "Decisão de migração" abaixo. (4) O CONTEXTO: com a Stop virando child de `Thread`, tudo que MUTA stop (`RaiseStop`, `ResolveStop`), o writer da policy (`UpdateStopCriteriaConfig`), a leitura cujo output É stop (`GetNeedsYouPanel`), os controllers correspondentes, o vocabulário de resolução, os error codes, o domain event e a publicação atravessam para `thread/` — porque `docs/BACKEND.md:170` proíbe importar entidade de outro contexto e `:173` proíbe mudar o estado de outro contexto fora de integration event. (5) Só então o CONTRATO: `issue-stop-*.tsp` → `thread-stop-*.tsp`, `issueId` opcional nos dois, `threadId` em ambos, regen + SDK, front re-apontado. `ThreadStatusDeriver` é ortogonal e roda em paralelo.

**Tech Stack:** TypeScript, Bun, Drizzle (SQLite/libsql), tsyringe-neo, Zod, TypeSpec (contracts), sqlc (Go, só regen), React (re-aponte de nomes)

**Spec:** .specs/2026-07-29-aggregate-boundaries-design.md
**Tasks:** 11
**Estimated minutes:** 455

---

## Decisões de desenho tomadas neste plano (grounded)

As duas que a spec deixou abertas, mais as três que caíram do código de HEAD.

### D-A — A tabela física NÃO é renomeada para `thread_stops`

**Escolha:** a **definição** de `stops` migra de `packages/contracts/db/schema-sqlite/issue.ts` para `packages/contracts/db/schema-sqlite/thread.ts`; o nome físico continua `issue_stops`; a única mudança de DDL é `issue_id` deixar de ser `NOT NULL`.

**Por quê** (a recomendação inicial era o rename pela convenção de prefixo; a premissa dela caiu no grep):

1. **O Go TOCA `issue_stops`.** `grep -rn "issue_stops\|thread_stops" packages/api/go/` → **22 hits** (`thread_stops` → 0). Além do DDL derivado (`core/db/sqlite/schema.sql`, e a cópia de `migrations/0000_*.sql`, ambos sincronizados por script), há **3 arquivos de query sqlc escritos à mão** — `core/db/sqlite/query/issue.sql:46,50,56,62`, `query/thread.sql:81`, `query/ui.sql:52` — e **6 arquivos gerados** (`gen/issue.sql.go:67,236,280,427`, `gen/thread.sql.go:184`, `gen/ui.sql.go:166`), incluindo **uma escrita** (`query/issue.sql:50` → `gen/issue.sql.go:427`, `UPDATE issue_stops`). Um rename obriga a editar os 3 `.sql` + rodar `sqlc generate` + `dump-sqlite-schema.ts` + `db:sync-go`. A spec afirma o oposto na linha 127 ("não há código Go afetado por esta spec") — o rename inventa um leg Go que a spec não previu.
2. **A própria spec dimensiona a migração como aditiva.** Risks & Migration: *"relaxar `issue_id` de `.notNull()` para nullable é uma migração aditiva (sem backfill)"*. Renomear tabela aplicada não é aditivo.
3. **drizzle-kit não infere rename de tabela; ele infere DROP + CREATE.** Zero precedente no repo de renomear tabela pré-existente: os únicos `ALTER TABLE ... RENAME TO` são o passo final do recreate-table dance (`0003_stormy_may_parker.sql:22`, `0004_moaning_doomsday.sql:44`). Com `strict: true` no `drizzle.config.ts`, drizzle-kit **pergunta** rename-vs-drop; prompts interativos não existem neste ambiente e a resposta errada é `DROP TABLE` com perda de dado.
4. **O nome físico já não é o sinal de dono aqui.** O símbolo Drizzle é `stops` (agnóstico) e os índices já largaram o prefixo (`stops_issue_id_idx`, `stops_thread_id_idx`). O que expressa dono neste repo é o ARQUIVO de schema + a docstring do bloco — e é exatamente isso que muda.

**Follow-up registrado (não vira Task):** o rename físico para `thread_stops` cabe numa frente própria de migração, junto com o passe de `query/*.sql` + `sqlc generate` do Go, e com a decisão de renomear também `issue_stops_kind_check`/`issue_stops_resolution_check`.

### D-B — A invariante quotedEntry-da-mesma-thread valida uma REFERÊNCIA RESOLVIDA

**Escolha:** `recordEntry` recebe `quotedEntry?: { entryId: string; threadId: string }` — uma referência já resolvida pelo chamador — e a entidade compara `quotedEntry.threadId !== this.id.value` **em memória**. Nada de provador/callback, nada de `EXISTS` no `save`, nada de carregar histórico.

**Por quê:**

1. **AC-1 exige teste de entidade SEM DB** (*"teste de entidade, sem DB"*). Um callback assíncrono ou um `EXISTS` no `save` empurraria a invariante para fora da entidade e tornaria o AC-1 literalmente inimplementável como escrito.
2. **Entidade não faz I/O** — regra dura da casa; nenhum método de `Thread`, `Issue` ou `AgentSession` recebe repositório.
3. **O chamador crítico já faz essa leitura hoje.** `IngestChannelMessage.ts:67` resolve a entry citada DENTRO da transação (`this.transcript.findById(input.quotedEntryId, tx)`) para calcular `repliesToAgent`. Passar `{ entryId, threadId }` dessa mesma linha custa ZERO query nova no caminho quente.
4. **Entry pendente também é coberta:** uma entry acumulada nesta mesma unidade de trabalho carrega `threadId === this.id.value`, então citar o que se acabou de gravar passa pela mesma comparação.
5. **Consequência assumida e documentada:** um `quotedEntryId` que não resolve deixa de ser gravado às cegas (hoje `IngestChannelMessage` e `RecordOrchestratorReply` escrevem a coluna mesmo quando o id não resolve). Os dois chamadores **degradam para "sem citação"**, que é a postura já escrita no código para o caso irmão — `RecordOrchestratorReply.ts:73-76`: *"Unresolvable degrades to no quote — an unquoted answer is worth far more than a silence."* A leitura fiel da invariante (a) é essa: só se cita uma entry cuja pertença à thread se pode PROVAR.

### D-C — Stop e TranscriptEntry viram child records do agregado, e a superfície de leitura é o próprio `ThreadRepository`

`TranscriptRepository` e `StopRepository` não são substituídos por dois novos "readers": as leituras que sobrevivem passam a ser métodos do `ThreadRepository` (`recentEntries`, `listEntries`, `findEntry`, `findStop`, `openStops`, `openStopsByIssue`). Três razões grounded:

1. **Decisão 5 da spec fala de ESCRITA** ("a escrita passa por método dele"). Um método de leitura no repositório do agregado dono não é um repositório de tabela-filha — é a superfície de persistência do agregado, e CLAUDE.md descreve Repository como *"findById, save, delete, mais buscas por identificador"*.
2. **Modo `mock` precisa de estado compartilhado.** `tests/flows/inbound-routing.flow.test.ts:67` e `tests/flows/stop-control-plane.flow.test.ts:29` rodam em `TestBed.create('mock', ...)` e leem entries/stops. Com a escrita indo pelo `MockThreadRepository` e a leitura vindo de um SEGUNDO mock, os dois precisariam de um store compartilhado registrado no DI. Com um único repositório, o `Map` interno do mock resolve o problema sem máquina nova.
3. **`RunOrchestratorTurn` já injeta `ThreadRepository`** (`agent/usecases/RunOrchestratorTurn.ts:118`). A janela de contexto (`:241`) troca `this.transcript.recentByThread(...)` por `this.threads.recentEntries(...)` e o contexto `agent` fica com **uma injeção a menos**, sem seam nova e sem `DrizzleClient` num use case de outro contexto.

### D-D — `Thread.raiseStop` NÃO levanta domain event novo; `Thread.resolveStop` levanta o migrado

`grep -rn "StopRaised" packages/api/typescript/src` prova que **não existe** `IssueStopRaisedEvent` em `issue/events/` — só `IssueStopResolvedEvent`. `IssueStopRaisedEvent` é **integration event** (de `@codedm/contracts-typescript/wire/events`), publicado UPSTREAM por `agent/handlers/PublishAgentIntegrationEvents.ts:128` a partir do domain event `AgentRunStopRaisedEvent`, e `RaiseStop` é o CONSUMIDOR dele (via `MaterializeIssueFromExecution.ts:79`). O comentário em `issue/events/index.ts:2-3` diz isso literalmente: *"Execution facts — opened / completed / stop_raised — are published by the terminal engine; BC5 reacts to those, it does not re-publish them."*

Logo: o `stop_raised` é CAUSA, não efeito — `raiseStop` não republica nada, e a publicação de `integration.thread.stop_raised` continua no publisher do contexto `agent`. Só `stop_resolved` migra de `PublishIssueIntegrationEvents` para `PublishThreadIntegrationEvents`, e o domain event vira `ThreadStopResolvedEvent` (`thread.stop_resolved`) em `thread/events/`.

Nota de mecanismo: `addDomainEvent`/`pullDomainEvents` existem em `core/src/entities/BaseEntity.ts:67-81` com **zero call sites em `packages/api/typescript/src`** hoje — o Go já usa o gêmeo (`ch.PullDomainEvents()` em `sqlite_channel_repository.go:174`). `Thread.resolveStop` é o PRIMEIRO usuário TS, e o dreno fica no use case (`domainEventRepository.saveMany(thread.pullDomainEvents(), tx)`), não no repositório, porque em TS é o use case que possui a transação.

### D-E — O control-plane de stop muda de contexto

`docs/BACKEND.md:170` — *"Direct imports of another context's entities or domain events are forbidden"* — e `:173` — *"Integration events are the only legal channel to change another context's state"*. Um use case em `issue/` chamando `thread.raiseStop()` + `threads.save()` violaria as duas. A extensão fiel de *"eventos vivem no contexto dono"* (emenda do founder para os eventos) aplicada aos comandos é a migração; e ela é **barata em superfície HTTP** porque neste repo o mount é uniforme e o controller possui o path: `ResolveStopController.path = '/stops/:stopId/resolve'`, `UpdateStopCriteriaController.path = '/settings/stop-criteria'`, `GetNeedsYouPanelController.path = '/threads/:threadId/needs-you'` — **nenhum path muda**, só a tag OpenAPI (`issue` → `thread`). Registrado como dúvida ao founder nas Notes (O2), porque a spec é silenciosa sobre localização.

---

## Inventário (rodada de pesquisa TS+Go — decisão 6b da spec)

Obrigatória antes de fechar tarefas. Rodada re-executada em HEAD `e6dd28d7`. Método: descoberta de diretórios `repositories/` (`find packages/api/typescript/src -type d -name repositories` → 7; `find packages/api/typescript/src/*/repositories -type d` → 22 = 7 pais + 15 folhas; `find packages/api/typescript/core/src -type d -name repositories` → 1; `find packages/api/go -type d -name repositories` → 2, com 3 pacotes de repositório) e classificação de cada um contra a regra da decisão 5.

O tell mecânico é exato no TS: **todo `extends Repository<T>` tem entidade; todo `abstract class XRepository {` pelado é tabela-filha ou infra** (6 deles). `grep -rn "class Stop\b\|class TranscriptEntry\|class TerminalLine\|class ConsumedMessage\|class MailboxItem\|class StopPolicy" packages/api/typescript/src/` → só os próprios `*Repository` abstratos, zero classes de entidade.

### TS — 16 repositórios

| # | Ctx | Repositório | file:line | Tabela escrita | Entidade? | Classificação |
|---|---|---|---|---|---|---|
| 1 | agent | `AgentSessionRepository extends Repository<AgentSession>` | `AgentSessionRepository.ts:5` | `agent_agent_sessions` | ✅ | JUSTIFICADO-AGREGADO |
| 2 | agent | `MailboxRepository` (pelado) | `MailboxRepository.ts:43` | `agent_mailbox` | ❌ | **JUSTIFICADO-INFRA** — fila durável por target com lease/dedup/poison (`:32-42`); não é modelo de domínio |
| 3 | artifact | `ArtifactRepository extends Repository<Artifact>` | `ArtifactRepository.ts:5` | `artifact_artifacts` | ✅ | JUSTIFICADO-AGREGADO |
| 4 | auth | `AccountRepository extends Repository<Account>` | `AccountRepository.ts:6` | `authentication_accounts` | ✅ | JUSTIFICADO-AGREGADO |
| 5 | auth | `UserRepository extends Repository<User>` | `UserRepository.ts:6` | `authentication_users` | ✅ | JUSTIFICADO-AGREGADO |
| 6 | auth | `UserProfileRepository extends Repository<UserProfile>` | `UserProfileRepository.ts:5` | `authentication_user_profiles` | ✅ | JUSTIFICADO-AGREGADO |
| 7 | issue | `IssueRepository extends Repository<Issue>` | `IssueRepository.ts:5` | `issue_issues` | ✅ | JUSTIFICADO-AGREGADO |
| 8 | issue | `StopRepository` (pelado) | `StopRepository.ts:28` | `issue_stops` | ❌ | **VIOLA (por retratação)** — ver nota (a) |
| 9 | issue | `StopPolicyConfigRepository` (pelado) | `StopPolicyConfigRepository.ts:20` | `issue_stop_policy_config` | ❌ | **VIOLA (justificativa no lugar errado)** — ver nota (b) |
| 10 | issue | `TerminalLineRepository` (pelado) | `TerminalLineRepository.ts:13` | `issue_terminal_lines` | ❌ | **JUSTIFICADO-DOCUMENTADO** → `Issue.ts:44` — ver nota (c) |
| 11 | owner | `OwnerRepository extends Repository<Owner>` | `OwnerRepository.ts:5` | `owner_owners` | ✅ | JUSTIFICADO-AGREGADO |
| 12 | thread | `ThreadRepository extends Repository<Thread>` | `ThreadRepository.ts:5` | `thread_threads` | ✅ | JUSTIFICADO-AGREGADO |
| 13 | thread | `TranscriptRepository` (pelado) | `TranscriptRepository.ts:36` | `thread_transcript_entries` | ❌ | **VIOLA** — ver nota (d) |
| 14 | thread | `ConsumedMessageRepository` (pelado) | `ConsumedMessageRepository.ts:18` | `thread_consumed_messages` | ❌ | **JUSTIFICADO-INFRA** — latch exactly-once `INSERT ... ON CONFLICT DO NOTHING` sobre `UNIQUE(channelId, platformMessageId)` (`:11-17`) + índice inverso entry↔platform id |
| 15 | workspace | `WorkspaceRepository extends Repository<Workspace>` | `WorkspaceRepository.ts:5` | `workspace_workspaces` | ✅ | JUSTIFICADO-AGREGADO |
| 16 | core | `DomainEventRepository extends Repository<BaseDomainEvent>` | `core/src/repositories/DomainEventRepository.ts:17` | `shared_events` + `shared_outbox` | n/a | JUSTIFICADO-INFRA |

Notas de classificação — onde a varredura mecânica e o veredito desta frente divergem, e por quê:

- **(a) `StopRepository`.** A varredura mecânica marca "justificado-documentado", porque `Issue.ts:44` diz literalmente *"Stops + the terminal log are separate tables (own lifecycles/scale)."* — uma linha que cobre DUAS tabelas-filha. A decisão 4/5 desta spec **retrata essa linha para Stop**: Stop deixa de ser tabela-filha independente do `Issue` e passa a ser sub-registro do agregado `Thread`. Logo o veredito operante é VIOLA, e o T10 corrige a própria linha de `Issue.ts:44` para citar só o terminal log.
- **(b) `StopPolicyConfigRepository`.** A justificativa existe e é boa, mas mora **no próprio repositório** — `StopPolicyConfigRepository.ts:19`: `/** The global (per-owner) stop-criteria toggles — demoted from an aggregate to a settings row. */`. A regra da decisão 5 exige a justificativa **no agregado pai**. Não há agregado pai em `issue/` para hospedá-la (a policy é per-owner, não per-issue). Na migração para `thread/repositories/` a justificativa vai junto e ganha o endereço certo: a docstring passa a citar o dono novo, e a linha correspondente aparece na docstring de `Thread`. **Sanado pela própria migração**, não por uma Task extra.
- **(c) `TerminalLineRepository`.** Fica. Único repositório de tabela-filha do TS que continua legítimo depois desta frente: justificativa explícita de lifecycle/escala no agregado pai (`Issue.ts:44`), replay T12, log de transporte, escala própria. **Não é tocado** — exceto pela correção redacional de `Issue.ts:44` no T10 (a linha hoje cita "Stops" como parte do que fica de fora, o que o B4 invalida para Stop).
- **(d) `TranscriptRepository`.** A varredura mecânica hesita ("justificado-fraco") porque `Thread.ts:59` menciona a separação — *"The transcript + pending clarifications are separate entities/records, not embedded here."* — mas essa frase é um **enunciado do FATO, não a razão de lifecycle/escala** que `Issue.ts:44` fornece. Sob a regra como escrita, isso é VIOLA. A razão real está na docstring do repositório (`TranscriptRepository.ts:32-35`: "queried per thread (T09) and per issue (T12)... auditability NFR") — ou seja, exatamente o sintoma que a decisão 5 nomeia: a justificativa mora no lugar errado. Corrigido por absorção (T1-T3), não por docstring.

**Contagem operante do TS: 3 VIOLA (8, 9, 13) — todos corrigidos nesta frente. 0 follow-ups em outros contextos.**

### GO — 6 repositórios, ZERO violações

| # | Pacote | Repositório | Arquivo | Tabela escrita | Classificação |
|---|---|---|---|---|---|
| 1 | channel/channel | `SqliteChannelRepository` | `sqlite_channel_repository.go:191` | `gateway_channels` | JUSTIFICADO-AGREGADO (`entities/channel.go`) |
| 2 | channel/message | `SqliteMessageRepository` | `sqlite_message_repository.go:109` | `gateway_messages` | JUSTIFICADO-AGREGADO (`entities/message.go`) |
| 3 | channel/message | `SqliteMessageProjectionRepository` | `sqlite_message_projection_repository.go:145,171,…` | `gateway_messages` | JUSTIFICADO-PROJEÇÃO (`projections/message.go`) |
| 4 | channel/remote | `SqliteRemoteRepository` | `sqlite_remote_repository.go:111` | `gateway_remotes` | JUSTIFICADO-AGREGADO (`entities/remote.go`) |
| 5 | channel/remote | `SqliteRemoteProjectionRepository` | `sqlite_remote_projection_repository.go:150,192,…` | `gateway_remotes` | JUSTIFICADO-PROJEÇÃO (`projections/remote.go`) |
| 5b | channel/remote | ↳ métodos de membership do mesmo repo | `…:352,369,416,453` | `gateway_remote_memberships` | ARMADILHA-JUSTIFICADA (read-model, escritor único) |
| 6 | core | `SqliteDomainEventRepository` | `sqlite_domain_event_repository.go:83` | `shared_outbox` + `shared_events` | JUSTIFICADO-INFRA |

Os três exemplos REAIS que alimentam a entrada da skill `repository/go` no T10:

- **Positivo (agregado inteiro):** `internal/channel/repositories/channel/sqlite_channel_repository.go` — `Find` (`:68`) hidrata via `hydrateChannel` (`:266`) → `entities.ReconstructChannel(...)` (`:279`), e `Save` (`:173`) tem `events := ch.PullDomainEvents()` como **primeira instrução** (`:174`), `SaveAll` (`:176`), e só então o `INSERT ... ON CONFLICT(id) DO UPDATE` (`:191-203`). Eventos antes do upsert, sempre.
- **Positivo-sutil (duas escritas, mesma tabela, colunas disjuntas por CONTRATO):** o repositório do agregado `remote` e o `RemoteProjectionRepository` escrevem ambos `gateway_remotes` com subconjuntos de colunas declaradamente disjuntos, documentado em `sqlite_remote_repository.go:108-110`: `// \`name\` is projection-owned: bound as '' on insert and never touched on conflict, so a projector-written display name survives an aggregate save.` **Achado colateral honesto:** a disjunção vale numa direção só — o `Save` largo da projeção (`:150` + `sqliteRemoteUpsertSet` `:165-179`) reclama 6 colunas do agregado no `ON CONFLICT DO UPDATE` (`type, pinned_at, archived, mute_expiration, marked_as_unread, deleted_at`) e é chamado por `remote_projector.go:38,126,191`. Registrado como observação O5; **não vira Task** (fora das Decisions).
- **Armadilha-justificada:** `gateway_remote_memberships` é escrita **só** pela projeção (`UpdateMembership :349`, `AddMember :382`, `RemoveMember :396`, `BulkUpdateMemberships :410`; os 4 writers gerados por sqlc em `core/db/sqlite/gen/channel.sql.go:41,59,68,585` têm **zero chamadores** — dead code). A membership **não tem identidade própria**: a única representação em código é `MembershipRow` (`remote_projection_repository.go:21-25`, sem campo de id), a identidade é a chave composta `ON CONFLICT(channel_id, group_id, member_id)`, e o conjunto é substituído por inteiro (DELETE-all + batch INSERT dentro de `inTx`). Correção factual sobre a nota que trouxe este item: a membership **não** está embutida na struct `entities.Remote` (`entities/remote.go:22`, cujo docstring `:18-21` diz "Invariant-bearing fields only") **nem** na `projections.Remote` (`projections/remote.go:15-34`) — ela não está em struct nenhuma, o que é justamente o que a torna legítima como tabela sem entidade.

### GO — a tabela de stops

`grep -rn "issue_stops\|thread_stops" packages/api/go/` → **22 hits, `thread_stops` = 0**. Todos em `core/db/sqlite/`: DDL derivado (`migrations/0000_flaky_carmella_unuscione.sql:242,253,254,257,258` e `schema.sql:197,208,209,368,369`) + query sqlc (`query/issue.sql:46,50,56,62`, `query/thread.sql:81`, `query/ui.sql:52`) + gerados (`gen/issue.sql.go:67,236,280,427`, `gen/thread.sql.go:184`, `gen/ui.sql.go:166`). **Zero hits fora de `core/db/sqlite/`** e **zero repositório Go de Stop** — o Go não tem bounded context `issue` (`ls packages/api/go/internal/` → `channel`, `shared`). Uma única escrita: `query/issue.sql:50` → `gen/issue.sql.go:427` (`UPDATE issue_stops`), na camada de query compartilhada, não num `repositories/`. É a base factual da decisão D-A.

`grep -rn "IssueStopRaised\|IssueStopResolved" packages/api/go/` fora de `core/db` → **vazio**. O rename de contrato do T7 não exige nenhuma edição Go à mão: só o regen de `packages/contracts/generated/go/wire/{events,envelope}.go`.

---

## Task T1: `Thread.recordEntry` — a thread decide quem pode citar o quê e quem precisa de sender

**Files to write:**
- Modify: `packages/api/typescript/src/thread/entities/Thread.ts` — `recordEntry` + `TranscriptEntrySchema` + `QuotedEntryRefSchema` + acumulador pendente
- Modify: `packages/api/typescript/src/thread/entities/Thread.test.ts` — o par vermelho→verde das duas invariantes
- Modify: `packages/api/typescript/src/thread/errors/index.ts` — 3 domain codes novos

**Files to read:**
- `packages/api/typescript/core/src/entities/BaseEntity.ts` — `addDomainEvent`/`pullDomainEvents` (`:67-81`), e por que um field initializer de subclasse sobrevive ao `Object.assign` do construtor
- `packages/api/typescript/src/thread/repositories/TranscriptRepository/TranscriptRepository.ts` — `AppendTranscriptInput`/`TranscriptEntryRow`, a forma que `TranscriptEntry` herda

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** opus
**Skills:** /entity, /errors, /test
**Depends on:** (none)
**Scope fence:** DONE: as duas invariantes da decisão 2 e o acúmulo pendente na entidade. OUT: persistência (T2), call sites (T3), stop (T5). Esta Task NÃO importa repositório nenhum dentro de `Thread.ts` — a entidade não faz I/O.
**Gate:** `cd packages/api/typescript && bun test src/thread/entities/Thread.test.ts && bun x tsc -p tsconfig.build.json --noEmit` — exit 0 nos dois

### Step T1.1 — Absorver a edição não commitada do founder

`packages/api/typescript/src/thread/entities/Thread.ts` tem uma edição **não commitada** do founder na working tree:

```
-import type { ApplicationErrors, DomainErrors } from '../errors'
+import type { DomainErrors } from '../errors'
```

(remoção do import órfão `ApplicationErrors`). Esta Task reescreve o arquivo e **ABSORVE** essa remoção — o arquivo proposto no Step T1.3 já parte dela. Nada de revert, nada de stash, nada de perguntar. A mensagem de commit do Step T1.6 **atribui explicitamente** a mudança ao founder.

- [ ] Confirmar que a única diferença de HEAD nesse arquivo é a linha do import: `git diff packages/api/typescript/src/thread/entities/Thread.ts`
- [ ] Se houver QUALQUER outra linha no diff, PARE e reporte — é edição nova do founder, não desta frente

### Step T1.2 — Os error codes das invariantes

Proposed file: Modify `packages/api/typescript/src/thread/errors/index.ts` — a união de domain errors e o `registerErrorCodes` ganham três códigos. Só o bloco alterado:

```typescript
// Domain errors — Thread aggregate invariants (raised by entity methods).
export type ThreadDomainErrors =
	| 'NO_PROVIDER_SELECTED'
	| 'LAST_INVOKER'
	| 'PARTICIPANT_NOT_FOUND'
	// Transcript invariants (B4, decision 2) — the thread owns who may cite what and who needs a sender.
	| 'QUOTED_ENTRY_NOT_IN_THREAD'
	| 'CONTACT_ENTRY_REQUIRES_SENDER'
	| 'AGENT_ENTRY_FORBIDS_SENDER'
export type DomainErrors = BaseDomainErrors | ThreadDomainErrors
```

e no `registerErrorCodes`, junto dos outros três domain codes:

```typescript
	QUOTED_ENTRY_NOT_IN_THREAD: HttpStatusCode.UNPROCESSABLE_ENTITY,
	CONTACT_ENTRY_REQUIRES_SENDER: HttpStatusCode.UNPROCESSABLE_ENTITY,
	AGENT_ENTRY_FORBIDS_SENDER: HttpStatusCode.UNPROCESSABLE_ENTITY,
```

`AGENT_ENTRY_FORBIDS_SENDER` cobre os dois kinds do lado proibido da matriz (`SYSTEM` e `WHISPER`): ambos são fala do sistema/operador, nenhum tem contato remetente. Um código por kind seria vocabulário sem consumidor.

### Step T1.3 — Proposed file: Modify `packages/api/typescript/src/thread/entities/Thread.ts`

COMPLETE final file (parte da working tree do founder, já com o import órfão fora):

```typescript
import { AggregateRoot, BaseError, Id, z } from '@codedm/core-typescript'
import type Z from 'zod'
import {
	ProviderKind,
	ContactKind,
	ThreadStatus,
	BufferSize,
	TranscriptKind,
	ClassificationMethod,
} from '@codedm/contracts-typescript/wire/enums'
import type { DomainErrors } from '../errors'
import { mentionsTag, stripMentionTag, MentionGateSchema } from '../schemas'

// ContactRef VO (embedded) — the channel counterparty. channelId lives on the Thread itself.
export const ContactRefSchema = z.object({
	externalId: z.string().min(1),
	displayName: z.string().min(1),
	kind: z.enum(ContactKind),
})

// Participant VO — everyone in the conversation; `canInvoke` gates who may trigger agents.
export const ParticipantSchema = z.object({
	participantId: z.string().min(1),
	name: z.string().min(1),
	source: z.string(),
	canInvoke: z.boolean(),
})

/**
 * A transcript entry — a CHILD RECORD of `Thread`, not an entity (B4, decision 1).
 *
 * No class, no identity of its own beyond `entryId`, no lifecycle: it is written once and never
 * transitions. What it does have is invariants, and those belong to the thread that owns it — which is
 * the whole point of the change. Before B4 this shape lived on `TranscriptRepository` as
 * `TranscriptEntryRow` and its id was minted inside `DrizzleTranscriptRepository.append()`, with no
 * aggregate anywhere in the path to reject a foreign citation or a `CONTACT` line with no sender.
 */
export const TranscriptEntrySchema = z.object({
	entryId: z.uuid(),
	ownerId: z.uuid(),
	threadId: z.uuid(),
	kind: z.enum(TranscriptKind),
	text: z.string(),
	issueId: z.string().optional(),
	quotedEntryId: z.string().optional(),
	senderExternalId: z.string().optional(),
	provider: z.enum(ProviderKind).optional(),
	classification: z.enum(ClassificationMethod).optional(),
	at: z.date(),
})

/**
 * A citation, RESOLVED (B4, decision D-B).
 *
 * `recordEntry` takes the quoted entry's `threadId` alongside its id rather than the id alone, because
 * the entity does no I/O and the invariant is about PROVABLE membership: you may cite an entry you can
 * show belongs to this thread. The caller is the one holding a transaction, and the caller that
 * actually needs this — `IngestChannelMessage` — already reads the quoted row inside its transaction to
 * decide `repliesToAgent`, so the proof costs nothing new. A citation that cannot be resolved degrades
 * to no citation at the call site; it is never written blind.
 */
export const QuotedEntryRefSchema = z.object({
	entryId: z.string().min(1),
	threadId: z.string().min(1),
})

export const ThreadSchema = z.object({
	ownerId: z.uuid(),
	channelId: z.uuid(),
	contactRef: ContactRefSchema,
	workspaceId: z.uuid(),
	// ≥1 provider (NO_PROVIDER_SELECTED is enforced at attach; this keeps the invariant post-hoc).
	providers: z.array(z.enum(ProviderKind)).min(1),
	paused: z.boolean(),
	mentionGate: MentionGateSchema,
	participants: z.array(ParticipantSchema),
	bufferSize: z.enum(BufferSize),
	status: z.enum(ThreadStatus),
})

export type ThreadProps = Z.infer<typeof ThreadSchema>
export type ContactRef = Z.infer<typeof ContactRefSchema>
export type MentionGate = Z.infer<typeof MentionGateSchema>
export type Participant = Z.infer<typeof ParticipantSchema>
export type TranscriptEntry = Z.infer<typeof TranscriptEntrySchema>
export type QuotedEntryRef = Z.infer<typeof QuotedEntryRefSchema>

/** What `ThreadRepository.save` drains and writes in the SAME transaction as the thread row. */
export interface PendingThreadWrites {
	entries: TranscriptEntry[]
}

/**
 * The roster id the OWNER always occupies — seeded by `AttachThread`, always `canInvoke: true`.
 *
 * The roster is about OTHER PEOPLE: it exists so the operator can mute specific participants, and
 * muting yourself is meaningless. So a message the owner typed is attributed to THIS id whichever
 * device it came from — the phone, another web client, or the console — rather than to their own
 * phone-number JID, which the gateway snapshot also puts in the roster with `canInvoke: false`
 * (it enumerates every group participant with no self filter). Without this, the owner's own message
 * is denied by the participant check BEFORE the mention gate is ever consulted.
 */
export const OPERATOR_PARTICIPANT_ID = 'operator'

/**
 * `Thread` (BC4 Thread & Routing, Core) — the binding of a conversation to a workspace + providers,
 * and its control plane: pause/resume, mention gate, participant invocation rights, and the rolling
 * context-buffer size. Invariants with teeth: providers non-empty and at least one invoker must
 * remain. The steer-vs-direct mode guard that used to live here is gone — see the note where the two
 * `assertCan*` methods stood.
 *
 * ### The transcript is PART of this aggregate (B4, decision 1)
 * It used to say "the transcript is a separate entity/record, not embedded here", and it said so as a
 * statement of fact with no reason attached — which is exactly the shape the new template rule calls
 * out: a child table with no aggregate in front of it and no lifecycle/scale justification in the
 * parent. There was no `TranscriptEntry` entity to make it true either; `TranscriptRepository` minted
 * ids in `DrizzleTranscriptRepository.append()` and inserted whatever it was handed. Now the WRITE goes
 * through `recordEntry`, which owns the two invariants nobody enforced before (a citation must belong
 * to this thread; `CONTACT` needs a sender and the system's own lines must not carry one), and
 * `ThreadRepository.save` persists the accumulated entries in the same transaction as the thread row.
 *
 * READS deliberately stay outside the aggregate: `findById` does NOT hydrate history — loading a
 * thread stays one row, forever — and the query use cases keep reading Drizzle directly (BFF). The
 * agent's context window reads `ThreadRepository.recentEntries`, which is the aggregate's persistence
 * surface, not a second child-table repository.
 */
export class Thread extends AggregateRoot<typeof ThreadSchema> {
	static override schema = ThreadSchema

	/**
	 * Entries recorded in THIS unit of work and not yet written.
	 *
	 * A subclass field initializer runs after `super(props)`, so the `Object.assign(this, …)` in
	 * `BaseEntity`'s constructor cannot clobber it, and `ThreadSchema` strips unknown keys so
	 * `validate()` cannot either. Same mechanism `BaseEntity.domainEvents` already uses.
	 */
	private pendingEntries: TranscriptEntry[] = []

	static create(data: {
		ownerId: string
		channelId: string
		contactRef: ContactRef
		workspaceId: string
		providers: ProviderKind[]
		/** The citation tag, minted by the caller from the linked workspace folder. */
		mentionTag: string
		participants: Participant[]
		bufferSize?: BufferSize
	}): Thread {
		if (data.providers.length === 0) throw new BaseError<DomainErrors>('NO_PROVIDER_SELECTED')
		if (!data.participants.some(p => p.canInvoke)) throw new BaseError<DomainErrors>('LAST_INVOKER', 'a thread needs at least one invoker')
		return new Thread({
			ownerId: data.ownerId,
			channelId: data.channelId,
			contactRef: data.contactRef,
			workspaceId: data.workspaceId,
			providers: data.providers,
			paused: false,
			// The gate is ON from birth and the tag is MINTED BY THE CALLER from the linked workspace
			// (`AttachThread`) — the entity has no workspace to derive it from. Required rather than
			// defaulted so an ungated thread is unconstructible, not merely unusual. Pre-existing rows are
			// untouched: this is create-time only, and `toPersistence` always writes the column explicitly,
			// so the schema's `.default(false)` never fires.
			mentionGate: { enabled: true, tag: data.mentionTag },
			participants: data.participants,
			bufferSize: data.bufferSize ?? BufferSize._50,
			status: ThreadStatus.IDLE,
		})
	}

	pause(): void {
		this.paused = true
		this.status = ThreadStatus.PAUSED
	}

	resume(): void {
		this.paused = false
		this.status = ThreadStatus.IDLE
	}

	configureMentionGate(gate: MentionGate): void {
		this.mentionGate = gate
		this.validate()
	}

	configureContextBuffer(size: BufferSize): void {
		this.bufferSize = size
	}

	setParticipantInvocation(participantId: string, canInvoke: boolean): void {
		const participant = this.participants.find(p => p.participantId === participantId)
		if (!participant) throw new BaseError<DomainErrors>('PARTICIPANT_NOT_FOUND', `no participant ${participantId}`)
		// Toggling the last invoker off is rejected — a thread must keep at least one invoker.
		if (!canInvoke && participant.canInvoke && this.participants.filter(p => p.canInvoke).length === 1) {
			throw new BaseError<DomainErrors>('LAST_INVOKER', 'at least one participant must keep invocation rights')
		}
		participant.canInvoke = canInvoke
		// Reassign to trigger the embedded-array persistence path.
		this.participants = [...this.participants]
	}

	/**
	 * Record a line of the conversation (B4, decision 1) — the ONLY way a transcript entry comes to be.
	 *
	 * Returns the record so the caller has the id SYNCHRONOUSLY, before any write: three of the four
	 * call sites use it as the dedup key of something they enqueue in the same transaction
	 * (`mailbox.enqueue({ dedupKey: entry.entryId })`, `enqueueCommand(..., { jobId: entry.entryId })`)
	 * and two return it in their output schema. That is why the id is minted HERE and not by the
	 * repository: an id that only exists after `save` cannot be referenced by the rows that commit with
	 * it.
	 *
	 * Nothing is written. The entry is accumulated, and `ThreadRepository.save(thread, tx)` persists it
	 * in the same transaction as the thread row — which is also how the one non-transactional writer got
	 * fixed: before B3/B4, `DeliverOrchestratorReply` appended outside any transaction.
	 *
	 * ### Invariant (a) — a citation belongs to THIS thread
	 * Enforced against a RESOLVED reference, not an id (see `QuotedEntryRefSchema`). Nobody checked this
	 * before, and the failure it admits is not abstract: the reply-quote path resolves ids that come off
	 * the wire, and an id from another conversation would have been written into this one's history.
	 *
	 * ### Invariant (b) — the kind×sender matrix
	 * `CONTACT` is somebody else speaking, so it MUST carry the JID that spoke; `SYSTEM` (the agent) and
	 * `WHISPER` (the operator instructing the agent) are this system's own words and must NOT borrow a
	 * contact's identity — a `SYSTEM` line with a sender reads, everywhere downstream, as if a human
	 * said what the model said. `DIRECT` and `ACTION` are deliberately unconstrained: the matrix the
	 * decision names covers three kinds, and inventing rules for the other two would be over-building.
	 */
	recordEntry(input: {
		kind: TranscriptKind
		text: string
		senderExternalId?: string
		quotedEntry?: QuotedEntryRef
		issueId?: string
		provider?: ProviderKind
		classification?: ClassificationMethod
		at?: Date
	}): TranscriptEntry {
		if (input.kind === TranscriptKind.CONTACT && !input.senderExternalId) {
			throw new BaseError<DomainErrors>('CONTACT_ENTRY_REQUIRES_SENDER', 'a CONTACT entry must carry the sender that spoke')
		}
		if ((input.kind === TranscriptKind.SYSTEM || input.kind === TranscriptKind.WHISPER) && input.senderExternalId) {
			throw new BaseError<DomainErrors>('AGENT_ENTRY_FORBIDS_SENDER', `a ${input.kind} entry must not carry a contact sender`)
		}
		if (input.quotedEntry && input.quotedEntry.threadId !== this.id.value) {
			throw new BaseError<DomainErrors>(
				'QUOTED_ENTRY_NOT_IN_THREAD',
				`entry ${input.quotedEntry.entryId} belongs to thread ${input.quotedEntry.threadId}`,
			)
		}

		const entry: TranscriptEntry = {
			entryId: Id.value(),
			ownerId: this.ownerId,
			threadId: this.id.value,
			kind: input.kind,
			text: input.text,
			issueId: input.issueId,
			quotedEntryId: input.quotedEntry?.entryId,
			senderExternalId: input.senderExternalId,
			provider: input.provider,
			classification: input.classification,
			at: input.at ?? new Date(),
		}
		this.pendingEntries.push(entry)
		return entry
	}

	/**
	 * Drain the writes accumulated in this unit of work. Called by `ThreadRepository.save` only.
	 *
	 * Mirrors `pullDomainEvents()`: one drain, clears the buffer, so a second `save` of the same
	 * instance cannot re-insert what already committed.
	 */
	pullPendingWrites(): PendingThreadWrites {
		const entries = this.pendingEntries
		this.pendingEntries = []
		return { entries }
	}

	/**
	 * Whether an inbound sender may invoke agents right now (pause + permission + mention gate).
	 *
	 * ### Replying to the agent IS addressing it
	 * `repliesToAgent` bypasses the MENTION GATE and nothing else. The gate exists to answer one
	 * question — "is this message for the agent?" — and a quote answers it better than a tag does:
	 * typing `@codedm` is a convention someone has to remember, while replying to the agent's own
	 * message is what everyone does by reflex in a group chat. Demanding the tag on a reply meant the
	 * natural answer to the agent's own question fell on the floor, and the operator had to remember
	 * that this one conversation needs a prefix its other participants never see.
	 *
	 * It deliberately does NOT bypass the two checks above it: a paused thread stays silent and a
	 * read-only participant stays read-only. A quote is evidence of ADDRESS, never of permission.
	 */
	canInvoke(input: { senderExternalId: string; text: string; repliesToAgent?: boolean }): boolean {
		if (this.paused) return false
		const participant = this.participants.find(p => p.participantId === input.senderExternalId)
		if (participant && !participant.canInvoke) return false
		if (input.repliesToAgent) return true
		if (this.mentionGate.enabled && !mentionsTag(input.text, this.mentionGate.tag)) return false
		return true
	}

	/**
	 * The message as the AGENT should read it — a citation is ADDRESSING, not content.
	 *
	 * With the gate on, every inbound carries the tag, so leaving it in would put `@codedm` at the head
	 * of every issue title and every slug key. The transcript keeps the text verbatim; only what is fed
	 * to the model is cleaned.
	 *
	 * Falls back to the ORIGINAL text when stripping empties it. A bare `@codedm` is the most natural
	 * thing someone types once told to cite the agent, and it strips to `''` — which `RunIssueTurn`'s
	 * `prompt: z.string().trim().min(1)` rejects, turning a summon into a thrown VALIDATION_ERROR.
	 */
	textWithoutMention(text: string): string {
		if (!this.mentionGate.enabled) return text
		return stripMentionTag(text, this.mentionGate.tag) || text
	}

	/*
	 * `assertCanSteer` / `assertCanSendDirect` are GONE (founder, 29-jul).
	 *
	 * They were mirror-image locks — steering required the thread to be live, sending a direct message
	 * required it to be paused — and between them the operator could only ever take ONE of the two
	 * actions at any moment. That was tolerable while a selector let them pick, but F4 removed the
	 * selector and made `composerMode` a function of pause state, at which point every message hit the
	 * lock for the state it was in: composing while paused raised THREAD_PAUSED, composing while
	 * running raised THREAD_NOT_PAUSED. Both halves of "não consigo mandar direct sem pausar e não
	 * consigo steerar pausado" are these two methods.
	 *
	 * What replaces them is nothing: the composer already picks the action that fits the state, and the
	 * operator typing into their own console is a deliberate act that does not need the aggregate's
	 * permission. NOTE the consequence, which is a live design question and not settled here — pause is
	 * enforced at INGEST only (`canInvoke` returns false), and the mailbox dispatcher does not consult
	 * it, so a steer issued while paused RUNS rather than waiting for resume.
	 */

	setStatus(status: ThreadStatus): void {
		this.status = status
	}
}

export interface Thread extends ThreadProps {}
```

### Step T1.4 — O FALSEADOR: os testes que reprovam com a validação desligada

Proposed file: Modify `packages/api/typescript/src/thread/entities/Thread.test.ts` — APPEND o describe abaixo ao final do arquivo existente (não reescreve os describes de `create`/`canInvoke`/`setParticipantInvocation` que já estão lá).

```typescript
/**
 * B4 decision 2 — the two invariants nobody enforced before. Pure entity, no DB (AC-1/AC-2).
 *
 * THE FALSIFIER, and it is the reason this Task exists at all: `TranscriptRepository.append()` accepted
 * every one of the four cases below and inserted the row. So each case is written to FAIL if the guard
 * is deleted — comment out the corresponding `throw` in `recordEntry` and the matching `it` goes red
 * with a useful message, rather than passing because nothing was asserted.
 */
describe('Thread.recordEntry — the thread owns who may cite what, and who needs a sender', () => {
	const threadOf = (mentionTag = '@ws') =>
		Thread.create({
			ownerId: OWNER_ID,
			channelId: CHANNEL_ID,
			contactRef: { externalId: 'contact-1', displayName: 'Contact', kind: ContactKind.USER },
			workspaceId: WORKSPACE_ID,
			providers: [ProviderKind.CLAUDE_CODE],
			mentionTag,
			participants: [{ participantId: 'operator', name: 'Operator', source: 'console', canInvoke: true }],
		})

	// ── AC-1: quotedEntry must belong to THIS thread ───────────────────────────────────────────────

	it('AC-1 FALSEADOR — a citation of an entry from ANOTHER thread is rejected and nothing is accumulated', () => {
		const threadA = threadOf()
		const threadB = threadOf()
		const e1 = threadA.recordEntry({ kind: TranscriptKind.CONTACT, text: 'olá', senderExternalId: 'contact-1' })

		expect(() =>
			threadB.recordEntry({
				kind: TranscriptKind.CONTACT,
				text: 'respondendo',
				senderExternalId: 'contact-1',
				quotedEntry: { entryId: e1.entryId, threadId: threadA.id.value },
			}),
		).toThrow('QUOTED_ENTRY_NOT_IN_THREAD')

		// The REJECTION half: a thrown invariant must leave the aggregate untouched. Without this the
		// guard could throw AFTER pushing and the test above would still pass.
		expect(threadB.pullPendingWrites().entries).toHaveLength(0)
	})

	it('a citation of an entry of the SAME thread is accepted, including one recorded in this same unit of work', () => {
		const thread = threadOf()
		const first = thread.recordEntry({ kind: TranscriptKind.CONTACT, text: 'pergunta', senderExternalId: 'contact-1' })

		const second = thread.recordEntry({
			kind: TranscriptKind.SYSTEM,
			text: 'resposta',
			quotedEntry: { entryId: first.entryId, threadId: thread.id.value },
		})

		expect(second.quotedEntryId).toBe(first.entryId)
		expect(thread.pullPendingWrites().entries).toHaveLength(2)
	})

	// ── AC-2: the kind × sender matrix ────────────────────────────────────────────────────────────

	it('AC-2 FALSEADOR — CONTACT without a sender is rejected', () => {
		const thread = threadOf()

		expect(() => thread.recordEntry({ kind: TranscriptKind.CONTACT, text: 'quem falou?' })).toThrow('CONTACT_ENTRY_REQUIRES_SENDER')
		expect(thread.pullPendingWrites().entries).toHaveLength(0)
	})

	it('AC-2 FALSEADOR — SYSTEM and WHISPER carrying a contact sender are both rejected', () => {
		const thread = threadOf()

		expect(() => thread.recordEntry({ kind: TranscriptKind.SYSTEM, text: 'pronto', senderExternalId: 'contact-1' })).toThrow(
			'AGENT_ENTRY_FORBIDS_SENDER',
		)
		expect(() => thread.recordEntry({ kind: TranscriptKind.WHISPER, text: 'pergunte de novo', senderExternalId: 'contact-1' })).toThrow(
			'AGENT_ENTRY_FORBIDS_SENDER',
		)
		expect(thread.pullPendingWrites().entries).toHaveLength(0)
	})

	it('the four production shapes all pass — CONTACT with sender, SYSTEM/WHISPER without, DIRECT unconstrained', () => {
		const thread = threadOf()

		thread.recordEntry({ kind: TranscriptKind.CONTACT, text: 'oi', senderExternalId: 'contact-1' })
		thread.recordEntry({ kind: TranscriptKind.SYSTEM, text: 'oi de volta' })
		thread.recordEntry({ kind: TranscriptKind.WHISPER, text: 'seja breve' })
		thread.recordEntry({ kind: TranscriptKind.DIRECT, text: 'eu mesmo respondo' })

		expect(thread.pullPendingWrites().entries.map(e => e.kind)).toEqual([
			TranscriptKind.CONTACT,
			TranscriptKind.SYSTEM,
			TranscriptKind.WHISPER,
			TranscriptKind.DIRECT,
		])
	})

	// ── The record the callers depend on ──────────────────────────────────────────────────────────

	it('mints the id SYNCHRONOUSLY and stamps owner + thread from the aggregate', () => {
		const thread = threadOf()

		const entry = thread.recordEntry({ kind: TranscriptKind.DIRECT, text: 'texto' })

		expect(entry.entryId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/)
		expect(entry.ownerId).toBe(thread.ownerId)
		expect(entry.threadId).toBe(thread.id.value)
	})

	it('pullPendingWrites DRAINS — a second call returns nothing, so a re-saved instance cannot double-insert', () => {
		const thread = threadOf()
		thread.recordEntry({ kind: TranscriptKind.DIRECT, text: 'uma vez' })

		expect(thread.pullPendingWrites().entries).toHaveLength(1)
		expect(thread.pullPendingWrites().entries).toHaveLength(0)
	})
})
```

- [ ] Reusar as constantes/imports que `Thread.test.ts` já declara no topo (`OWNER_ID`, `CHANNEL_ID`, `WORKSPACE_ID`, `ContactKind`, `ProviderKind`); adicionar só `TranscriptKind` ao import de `wire/enums` se ainda não estiver lá

### Step T1.5 — Rodar e ver o vermelho, e depois o verde

- [ ] `cd packages/api/typescript && bun test src/thread/entities/Thread.test.ts` ANTES do Step T1.3 → falha com `recordEntry is not a function`
- [ ] Aplicar T1.2 + T1.3, rodar de novo → verde
- [ ] **Provar que o gate pode falhar:** comentar o `throw` de `QUOTED_ENTRY_NOT_IN_THREAD` em `recordEntry`, rodar → o `it` AC-1 FALSEADOR fica vermelho. Descomentar. Repetir para `CONTACT_ENTRY_REQUIRES_SENDER`. Registrar as duas saídas no artefato do T11.
- [ ] `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` → exit 0

### Step T1.6 — Commit

```bash
git add packages/api/typescript/src/thread/entities/Thread.ts \
        packages/api/typescript/src/thread/entities/Thread.test.ts \
        packages/api/typescript/src/thread/errors/index.ts
git commit -m "feat(thread): B4 — a thread decide quem pode citar o quê e quem precisa de sender

recordEntry mint o id, valida as duas invariantes da decisão 2 (citação da
própria thread, via referência RESOLVIDA; matriz kind x sender) e acumula a
entry pendente. Nenhuma escrita: quem persiste é ThreadRepository.save, na
mesma transação (T2). O load continua sem hidratar histórico.

Inclui a remoção do import órfão ApplicationErrors — edição do founder na
working tree, absorvida com atribuição."
```

---

## Task T2: `ThreadRepository` grava as entries pendentes na MESMA transação e passa a ser a superfície de leitura do agregado

**Files to write:**
- Modify: `packages/api/typescript/src/thread/repositories/ThreadRepository/ThreadRepository.ts` — leituras-filhas na interface
- Modify: `packages/api/typescript/src/thread/repositories/ThreadRepository/DrizzleThreadRepository.ts` — `save` dreno + as leituras
- Modify: `packages/api/typescript/src/thread/repositories/ThreadRepository/MockThreadRepository.ts` — store in-memory das entries
- Create: `packages/api/typescript/src/thread/repositories/ThreadRepository/DrizzleThreadRepository.test.ts` — AC-3 (atomicidade)

**Files to read:**
- `packages/api/typescript/src/thread/repositories/TranscriptRepository/DrizzleTranscriptRepository.ts` — o mapeamento row↔record que migra (`toRow`, a ordenação de `recentByThread`)
- `packages/api/typescript/src/thread/repositories/TranscriptRepository/DrizzleTranscriptRepository.test.ts` — o caso "every TranscriptKind survives the DB check constraint", que precisa sobreviver à migração
- `packages/api/typescript/src/issue/repositories/IssueRepository/DrizzleIssueRepository.test.ts` — o molde de teste de repositório com `TestBed('integration')`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** opus
**Skills:** /repository, /test
**Depends on:** T1
**Consumes (frozen):** de T1, verbatim — `Thread.recordEntry(input): TranscriptEntry`, `Thread.pullPendingWrites(): PendingThreadWrites`, `TranscriptEntry` / `TranscriptEntrySchema` / `QuotedEntryRef` exportados de `packages/api/typescript/src/thread/entities/Thread.ts`, e os códigos `QUOTED_ENTRY_NOT_IN_THREAD` / `CONTACT_ENTRY_REQUIRES_SENDER` / `AGENT_ENTRY_FORBIDS_SENDER` em `thread/errors`.
**Scope fence:** DONE: persistência + leitura de `thread_transcript_entries` pelo repositório do agregado. OUT: apagar `TranscriptRepository` e mexer nos call sites (T3); stop (T5). Esta Task NÃO toca `Thread.ts`.
**Gate:** `cd packages/api/typescript && bun test src/thread/repositories/ThreadRepository/DrizzleThreadRepository.test.ts && bun x tsc -p tsconfig.build.json --noEmit` — exit 0 nos dois

### Step T2.1 — Proposed file: Modify `packages/api/typescript/src/thread/repositories/ThreadRepository/ThreadRepository.ts`

COMPLETE final file:

```typescript
import { Repository } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { Thread, type TranscriptEntry } from '../../entities/Thread'

/**
 * The persistence boundary of the `Thread` AGGREGATE — the thread row plus the transcript entries the
 * aggregate accumulated (B4, decision 1).
 *
 * ### Why the child reads live here and not in a second repository
 * `TranscriptRepository` is gone: it was a child-table repository with no entity behind it, which is
 * the pattern the new template rule forbids. What survives of it are READS, and a read of the
 * aggregate's own rows is this repository's surface — the same way `findByChannelContact` is. Adding a
 * `TranscriptReader` seam instead would recreate the thing being deleted under a new name, and in
 * `mock` mode it would need a store shared with `MockThreadRepository` to be usable at all.
 *
 * ### `findById` does NOT hydrate the transcript
 * Loading a thread stays exactly one row, forever. A conversation has no bound, so an aggregate that
 * loaded its own history would make every pause/resume/steer proportional to how long the thread has
 * been alive. The write side needs no history to be correct: `recordEntry` validates a citation against
 * a reference the caller resolved, not against a loaded collection.
 *
 * ### `save` is atomic only with a transaction
 * The pending entries are written on the SAME `dbc` as the thread row, so passing `tx` is what makes
 * thread+entries atomic — identical to how the entity row and its domain-event row are atomic only
 * because the use case wraps both in `withTransaction`. Every production writer passes it.
 */
export abstract class ThreadRepository extends Repository<Thread> {
	abstract findById(id: string, tx?: Transaction): Promise<Thread | undefined>
	// Attach dedupe + inbound routing: one thread per (channel, contact) per owner.
	abstract findByChannelContact(channelId: string, contactExternalId: string, tx?: Transaction): Promise<Thread | undefined>
	abstract listByOwner(ownerId: string, tx?: Transaction): Promise<Thread[]>

	// ── Child reads: the transcript rows this aggregate owns ──────────────────────────────────────

	/** Rolling context buffer: the most recent N entries of a thread, CHRONOLOGICAL (oldest first). */
	abstract recentEntries(threadId: string, limit: number, tx?: Transaction): Promise<TranscriptEntry[]>
	/** The whole conversation, chronological. Test/flow surface; the UI reads Drizzle directly (BFF). */
	abstract listEntries(threadId: string, tx?: Transaction): Promise<TranscriptEntry[]>
	/**
	 * One entry by id — how a caller RESOLVES a citation before handing it to `recordEntry`. Returns the
	 * record with its `threadId`, which is the proof of membership the aggregate checks.
	 */
	abstract findEntry(entryId: string, tx?: Transaction): Promise<TranscriptEntry | undefined>
}
```

### Step T2.2 — Proposed file: Modify `packages/api/typescript/src/thread/repositories/ThreadRepository/DrizzleThreadRepository.ts`

COMPLETE final file:

```typescript
import { injectable } from 'tsyringe-neo'
import { and, asc, desc, eq } from 'drizzle-orm'
import { DrizzleClient, tryCatchAsync } from '@codedm/core-typescript'
import { threads, transcriptEntries } from '@codedm/contracts/db'
import type { ProviderKind, ContactKind, ThreadStatus, BufferSize, ClassificationMethod, TranscriptKind } from '@codedm/contracts-typescript/wire/enums'
import { Thread, ThreadSchema, type MentionGate, type Participant, type TranscriptEntry } from '../../entities/Thread'
import { ThreadRepository } from './ThreadRepository'

@injectable()
export class DrizzleThreadRepository extends ThreadRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	async findById(id: string, tx?: DrizzleClient): Promise<Thread | undefined> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbc.select().from(threads).where(eq(threads.id, id)).limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async findByChannelContact(channelId: string, contactExternalId: string, tx?: DrizzleClient): Promise<Thread | undefined> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbc
				.select()
				.from(threads)
				.where(and(eq(threads.channelId, channelId), eq(threads.contactExternalId, contactExternalId)))
				.limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async listByOwner(ownerId: string, tx?: DrizzleClient): Promise<Thread[]> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => dbc.select().from(threads).where(eq(threads.ownerId, ownerId)))
		if (!result.success || !result.data) return []
		return result.data.map(row => this.toDomain(row))
	}

	/**
	 * The thread row plus every entry the aggregate accumulated, on the SAME `dbc` (B4, decision 1).
	 *
	 * Order matters: the thread row first, then its children — so a reader that sees an entry always
	 * sees the thread it hangs off. Ids come from `recordEntry`, never from here, which is the whole
	 * difference from the `DrizzleTranscriptRepository.append()` this replaces (it minted with
	 * `crypto.randomUUID()` inside the insert, so no aggregate could reference the row it was creating).
	 */
	async save(entity: Thread, tx?: DrizzleClient): Promise<Thread> {
		entity.incrementVersion()
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const data = this.toPersistence(entity)
			await dbc
				.insert(threads)
				.values(data)
				.onConflictDoUpdate({
					target: threads.id,
					set: {
						providers: data.providers,
						paused: data.paused,
						mentionGateEnabled: data.mentionGateEnabled,
						mentionGateTag: data.mentionGateTag,
						participants: data.participants,
						bufferSize: data.bufferSize,
						status: data.status,
						updatedAt: new Date(),
						version: data.version,
					},
				})

			const { entries } = entity.pullPendingWrites()
			if (entries.length > 0) {
				await dbc.insert(transcriptEntries).values(entries.map(entry => this.entryToPersistence(entry)))
			}
			return entity
		})
		if (!result.success) throw result.error
		return result.data
	}

	async delete(id: string, tx?: DrizzleClient): Promise<void> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			await dbc.delete(threads).where(eq(threads.id, id))
		})
		if (!result.success) throw result.error
	}

	// ── Child reads ───────────────────────────────────────────────────────────────────────────────

	async recentEntries(threadId: string, limit: number, tx?: DrizzleClient): Promise<TranscriptEntry[]> {
		const dbc = tx ?? this.db
		// DESC + limit is the only way to take the LAST N; `.reverse()` hands them back chronological,
		// which is the order the agent's context window must read them in.
		const rows = await dbc
			.select()
			.from(transcriptEntries)
			.where(eq(transcriptEntries.threadId, threadId))
			.orderBy(desc(transcriptEntries.at))
			.limit(limit)
		return rows.map(row => this.toEntry(row)).reverse()
	}

	async listEntries(threadId: string, tx?: DrizzleClient): Promise<TranscriptEntry[]> {
		const dbc = tx ?? this.db
		const rows = await dbc
			.select()
			.from(transcriptEntries)
			.where(eq(transcriptEntries.threadId, threadId))
			.orderBy(asc(transcriptEntries.at))
		return rows.map(row => this.toEntry(row))
	}

	async findEntry(entryId: string, tx?: DrizzleClient): Promise<TranscriptEntry | undefined> {
		const dbc = tx ?? this.db
		const rows = await dbc.select().from(transcriptEntries).where(eq(transcriptEntries.id, entryId)).limit(1)
		return rows[0] ? this.toEntry(rows[0]) : undefined
	}

	// ── Mapping ───────────────────────────────────────────────────────────────────────────────────

	private toDomain(row: typeof threads.$inferSelect): Thread {
		const mentionGate: MentionGate = row.mentionGateEnabled
			? { enabled: true, tag: row.mentionGateTag ?? '' }
			: { enabled: false }
		const parsed = ThreadSchema.parse({
			ownerId: row.ownerId,
			channelId: row.channelId,
			contactRef: { externalId: row.contactExternalId, displayName: row.contactDisplayName, kind: row.contactKind as ContactKind },
			workspaceId: row.workspaceId,
			providers: row.providers as ProviderKind[],
			paused: row.paused,
			mentionGate,
			participants: row.participants as Participant[],
			bufferSize: row.bufferSize as BufferSize,
			status: row.status as ThreadStatus,
		})
		return new Thread({ ...parsed, id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt, version: row.version })
	}

	private toPersistence(entity: Thread): typeof threads.$inferInsert {
		return {
			id: entity.id.value,
			ownerId: entity.ownerId,
			channelId: entity.channelId,
			contactExternalId: entity.contactRef.externalId,
			contactDisplayName: entity.contactRef.displayName,
			contactKind: entity.contactRef.kind,
			workspaceId: entity.workspaceId,
			providers: entity.providers,
			paused: entity.paused,
			mentionGateEnabled: entity.mentionGate.enabled,
			mentionGateTag: entity.mentionGate.enabled ? entity.mentionGate.tag : null,
			participants: entity.participants,
			bufferSize: entity.bufferSize,
			status: entity.status,
			createdAt: entity.createdAt,
			updatedAt: entity.updatedAt,
			version: entity.version,
		}
	}

	private entryToPersistence(entry: TranscriptEntry): typeof transcriptEntries.$inferInsert {
		return {
			id: entry.entryId,
			ownerId: entry.ownerId,
			threadId: entry.threadId,
			kind: entry.kind,
			text: entry.text,
			issueId: entry.issueId ?? null,
			quotedEntryId: entry.quotedEntryId ?? null,
			senderExternalId: entry.senderExternalId ?? null,
			provider: entry.provider ?? null,
			classification: entry.classification ?? null,
			at: entry.at,
		}
	}

	/**
	 * NO casts, deliberately — `DrizzleTranscriptRepository.toRow` had four and every one was a no-op.
	 * `thread_transcript_entries` declares `kind`, `provider` and `classification` with `$type<…>()`
	 * (`schema-sqlite/thread.ts`), so the row is already narrowed and `as TranscriptKind` only hid that
	 * fact — and hid it in the one place a real mismatch would matter.
	 */
	private toEntry(row: typeof transcriptEntries.$inferSelect): TranscriptEntry {
		return {
			entryId: row.id,
			ownerId: row.ownerId,
			threadId: row.threadId,
			kind: row.kind,
			text: row.text,
			issueId: row.issueId ?? undefined,
			quotedEntryId: row.quotedEntryId ?? undefined,
			senderExternalId: row.senderExternalId ?? undefined,
			provider: row.provider ?? undefined,
			classification: row.classification ?? undefined,
			at: row.at,
		}
	}
}
```

- [ ] O import de tipos de `wire/enums` neste arquivo fica só com o que `toDomain` ainda usa (`ProviderKind`, `ContactKind`, `ThreadStatus`, `BufferSize`) — `TranscriptKind` e `ClassificationMethod` saem, porque sem os casts não há mais referência a eles. `noUnusedLocals` acusa se ficarem.
- [ ] `toDomain`/`toPersistence` ficam **byte-idênticos** ao de HEAD, casts inclusos: são código não tocado por esta frente, e limpá-los seria refactor não pedido num método que a Task não precisa mudar.

### Step T2.3 — Proposed file: Modify `packages/api/typescript/src/thread/repositories/ThreadRepository/MockThreadRepository.ts`

COMPLETE final file:

```typescript
import { injectable } from 'tsyringe-neo'
import { Thread, type TranscriptEntry } from '../../entities/Thread'
import { ThreadRepository } from './ThreadRepository'

/**
 * Test double for `mock` mode.
 *
 * It stores the ENTRIES too, and that is not incidental: with the transcript absorbed into the
 * aggregate (B4, decision 1), the flow tests that run in `mock` (`tests/flows/inbound-routing.flow.test.ts`,
 * `tests/flows/stop-control-plane.flow.test.ts`) write through this repository and read back through
 * it. A separate transcript double would need a store shared with this one through the DI container;
 * one repository makes the two halves the same `Map`.
 */
@injectable()
export class MockThreadRepository extends ThreadRepository {
	private store = new Map<string, Thread>()
	private entries: TranscriptEntry[] = []

	async findById(id: string): Promise<Thread | undefined> {
		return this.store.get(id)
	}

	async findByChannelContact(channelId: string, contactExternalId: string): Promise<Thread | undefined> {
		for (const t of this.store.values()) {
			if (t.channelId === channelId && t.contactRef.externalId === contactExternalId) return t
		}
		return undefined
	}

	async listByOwner(ownerId: string): Promise<Thread[]> {
		return [...this.store.values()].filter(t => t.ownerId === ownerId)
	}

	async save(entity: Thread): Promise<Thread> {
		entity.incrementVersion()
		this.store.set(entity.id.value, entity)
		const { entries } = entity.pullPendingWrites()
		this.entries.push(...entries)
		return entity
	}

	async delete(id: string): Promise<void> {
		this.store.delete(id)
		this.entries = this.entries.filter(e => e.threadId !== id)
	}

	async recentEntries(threadId: string, limit: number): Promise<TranscriptEntry[]> {
		return this.byThreadChronological(threadId).slice(-limit)
	}

	async listEntries(threadId: string): Promise<TranscriptEntry[]> {
		return this.byThreadChronological(threadId)
	}

	async findEntry(entryId: string): Promise<TranscriptEntry | undefined> {
		return this.entries.find(e => e.entryId === entryId)
	}

	private byThreadChronological(threadId: string): TranscriptEntry[] {
		return this.entries.filter(e => e.threadId === threadId).sort((a, b) => a.at.getTime() - b.at.getTime())
	}
}
```

### Step T2.4 — Proposed file: Create `packages/api/typescript/src/thread/repositories/ThreadRepository/DrizzleThreadRepository.test.ts`

COMPLETE file. Absorve o caso do `DrizzleTranscriptRepository.test.ts` que morre no T3 (todo `TranscriptKind` sobrevive ao CHECK do banco) e adiciona o AC-3.

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { threads, transcriptEntries } from '@codedm/contracts/db'
import { DrizzleClient, DrizzleDatabaseDriver } from '@codedm/core-typescript'
import { TranscriptKind } from '@codedm/contracts-typescript/wire/enums'
import { TestBed, givenThread } from '@test/support'
import { OPERATOR_ID } from '@auth/operator'
import { ThreadRepository } from './ThreadRepository'

/**
 * The aggregate's persistence boundary now spans TWO tables (B4, decision 1), and the property that
 * makes the change worth making is atomicity: before B4 the entry was inserted by a repository of its
 * own, so nothing tied it to the thread write — and one of the four callers
 * (`DeliverOrchestratorReply`) had no transaction at all.
 */
describe('DrizzleThreadRepository — the thread row and its transcript entries commit or roll back together', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let db: DrizzleClient
	let driver: DrizzleDatabaseDriver
	let repo: ThreadRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
		db = testBed.resolve(DrizzleClient)
		driver = testBed.resolve(DrizzleDatabaseDriver)
	})
	beforeEach(async () => {
		await testBed.reset()
		repo = testBed.resolve(ThreadRepository)
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const entryRows = async (threadId: string) => db.select().from(transcriptEntries).where(eq(transcriptEntries.threadId, threadId))

	it('AC-3 — save(thread, tx) persists the thread row AND the accumulated entries', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })

		const entry = thread.recordEntry({ kind: TranscriptKind.DIRECT, text: 'gravado pelo agregado' })
		await driver.transaction(tx => repo.save(thread, tx))

		const rows = await entryRows(thread.id.value)
		expect(rows).toHaveLength(1)
		expect(rows[0]!.id).toBe(entry.entryId)
		expect(rows[0]!.text).toBe('gravado pelo agregado')
		expect((await db.select().from(threads).where(eq(threads.id, thread.id.value)))).toHaveLength(1)
	})

	it('AC-3 FALSEADOR — a rolled-back transaction leaves NEITHER a new entry NOR the thread bump', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const versionBefore = (await db.select().from(threads).where(eq(threads.id, thread.id.value)))[0]!.version

		thread.recordEntry({ kind: TranscriptKind.DIRECT, text: 'nunca commitado' })
		await expect(
			driver.transaction(async tx => {
				await repo.save(thread, tx)
				// The entry is visible INSIDE the transaction — proof the write happened and was undone,
				// not that it never ran.
				expect(await repo.listEntries(thread.id.value, tx)).toHaveLength(1)
				throw new Error('rollback')
			}),
		).rejects.toThrow('rollback')

		expect(await entryRows(thread.id.value)).toHaveLength(0)
		expect((await db.select().from(threads).where(eq(threads.id, thread.id.value)))[0]!.version).toBe(versionBefore)
	})

	it('writes MANY entries recorded in one unit of work, in the order they were recorded', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })

		const first = thread.recordEntry({ kind: TranscriptKind.CONTACT, text: 'pergunta', senderExternalId: 'contact-1', at: new Date(1_000) })
		const second = thread.recordEntry({
			kind: TranscriptKind.SYSTEM,
			text: 'resposta',
			quotedEntry: { entryId: first.entryId, threadId: thread.id.value },
			at: new Date(2_000),
		})
		await driver.transaction(tx => repo.save(thread, tx))

		const listed = await repo.listEntries(thread.id.value)
		expect(listed.map(e => e.entryId)).toEqual([first.entryId, second.entryId])
		expect(listed[1]!.quotedEntryId).toBe(first.entryId)
	})

	// Migrated verbatim in intent from DrizzleTranscriptRepository.test.ts, which T3 deletes: the DB
	// CHECK constraint on `kind` enumerates the enum, so a value the code accepts and the constraint
	// rejects is a runtime-only failure no type check catches.
	it('every TranscriptKind survives the DB check constraint', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })

		for (const kind of Object.values(TranscriptKind)) {
			// The matrix decides who carries a sender; this case is about the constraint, not the matrix.
			thread.recordEntry({ kind, text: `kind ${kind}`, senderExternalId: kind === TranscriptKind.CONTACT ? 'contact-1' : undefined })
		}
		await driver.transaction(tx => repo.save(thread, tx))

		expect(await entryRows(thread.id.value)).toHaveLength(Object.values(TranscriptKind).length)
	})

	it('recentEntries returns the LAST n, chronological; findEntry resolves a citation with its threadId', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		for (let i = 0; i < 5; i++) thread.recordEntry({ kind: TranscriptKind.DIRECT, text: `linha ${i}`, at: new Date(1_000 * (i + 1)) })
		await driver.transaction(tx => repo.save(thread, tx))

		const window = await repo.recentEntries(thread.id.value, 3)
		expect(window.map(e => e.text)).toEqual(['linha 2', 'linha 3', 'linha 4'])

		const resolved = await repo.findEntry(window[0]!.entryId)
		expect(resolved?.threadId).toBe(thread.id.value)
	})

	it('findById does NOT hydrate history — a loaded thread carries zero pending writes', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		thread.recordEntry({ kind: TranscriptKind.DIRECT, text: 'persistida' })
		await driver.transaction(tx => repo.save(thread, tx))

		const reloaded = await repo.findById(thread.id.value)

		expect(reloaded).toBeDefined()
		expect(reloaded!.pullPendingWrites().entries).toHaveLength(0)
	})
})
```

### Step T2.5 — Verde

- [ ] `cd packages/api/typescript && bun test src/thread/repositories/ThreadRepository/DrizzleThreadRepository.test.ts` → 0 fail
- [ ] `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` → exit 0 (`TranscriptRepository` ainda existe; nada quebra)

### Step T2.6 — Commit

```bash
git add packages/api/typescript/src/thread/repositories/ThreadRepository/
git commit -m "feat(thread): B4 — o agregado persiste thread + entries na mesma transacao

ThreadRepository.save dreno pullPendingWrites e insere as entries no MESMO dbc
da linha da thread; as leituras que sobrevivem (recentEntries, listEntries,
findEntry) passam a ser a superficie do proprio agregado em vez de um segundo
repositorio de tabela-filha. findById continua sem hidratar historico.

O caso do CHECK de TranscriptKind foi migrado do teste do TranscriptRepository,
que morre no proximo commit."
```

---

## Task T3: os quatro call sites de escrita passam pelo agregado e `TranscriptRepository` morre

**Files to write:**
- Delete: `packages/api/typescript/src/thread/repositories/TranscriptRepository/TranscriptRepository.ts`
- Delete: `packages/api/typescript/src/thread/repositories/TranscriptRepository/DrizzleTranscriptRepository.ts`
- Delete: `packages/api/typescript/src/thread/repositories/TranscriptRepository/MockTranscriptRepository.ts`
- Delete: `packages/api/typescript/src/thread/repositories/TranscriptRepository/DrizzleTranscriptRepository.test.ts`
- Delete: `packages/api/typescript/src/thread/repositories/TranscriptRepository/index.ts`
- Modify: `packages/api/typescript/src/thread/usecases/SteerThread.ts`
- Modify: `packages/api/typescript/src/thread/usecases/SendDirectMessage.ts`
- Modify: `packages/api/typescript/src/thread/usecases/IngestChannelMessage.ts`
- Modify: `packages/api/typescript/src/thread/usecases/RecordOrchestratorReply.ts`
- Modify: `packages/api/typescript/src/agent/usecases/RunOrchestratorTurn.ts`
- Modify: `packages/api/typescript/src/thread/registry.ts`
- Modify: `packages/api/typescript/src/thread/repositories/index.ts`
- Modify: `packages/api/typescript/src/shared/context-map.ts`
- Modify: `packages/api/typescript/src/thread/usecases/SendDirectMessage.test.ts`
- Modify: `packages/api/typescript/src/thread/usecases/IngestChannelMessage.test.ts`
- Modify: `packages/api/typescript/src/thread/usecases/RecordOrchestratorReply.test.ts`
- Modify: `packages/api/typescript/src/thread/handlers/ConsumeInboundMessage.test.ts`
- Modify: `packages/api/typescript/src/thread/handlers/DeliverOrchestratorReply.test.ts`
- Modify: `packages/api/typescript/tests/flows/inbound-routing.flow.test.ts`
- Modify: `packages/api/typescript/tests/flows/agent-session-resume.flow.test.ts`
- Modify: `packages/api/typescript/tests/integration/redis-bridge.integration.test.ts`
- Modify: `packages/api/typescript/tests/kernel/insert-site-audit.test.ts`

**Files to read:**
- `packages/api/typescript/src/thread/usecases/IngestChannelMessage.ts` — a resolução da entry citada em `:67` (o único lugar que já lê o que a decisão D-B pede)
- `packages/api/typescript/src/agent/usecases/RunOrchestratorTurn.ts` — `buildWindow` (`~:238`), o quinto consumidor (só-leitura) que sobrevive por decisão 3

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** opus
**Skills:** /usecase, /repository, /test
**Depends on:** T2
**Consumes (frozen):** de T1/T2, verbatim — `thread.recordEntry({ kind, text, senderExternalId?, quotedEntry?, issueId?, provider?, classification?, at? }): TranscriptEntry` (campo de retorno `entryId`), `threads.save(thread, tx)`, `threads.findEntry(entryId, tx)`, `threads.recentEntries(threadId, limit)`, `threads.listEntries(threadId)`, e o tipo `TranscriptEntry` de `@thread/entities/Thread`.
**Scope fence:** DONE: os 4 writers + a janela do orquestrador + a morte de `TranscriptRepository`. OUT: stop (T5), `ThreadStatusDeriver` (T9). NÃO muda a semântica de nenhum use case além do que a decisão D-B obriga (citação não resolvível degrada para "sem citação").
**Gate:** `cd packages/api/typescript && bun test src/thread tests/flows tests/integration tests/kernel && bun x tsc -p tsconfig.build.json --noEmit` — exit 0 nos dois, e `grep -rn "TranscriptRepository" packages/api/typescript` retorna vazio (AC-4)

### Step T3.1 — Proposed file: Modify `packages/api/typescript/src/thread/usecases/SteerThread.ts`

O caso mais simples: WHISPER sem sender, sem citação. Sai a injeção `transcript`, entra o `save`. Bloco alterado (o resto do arquivo — o docblock, o `OpenIssuesReader` fora da transação, os dois `mailbox.enqueue` e os comentários — fica intacto):

```typescript
import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { MailboxItemKind, MailboxTargetKind, TranscriptKind } from '@codedm/contracts-typescript/wire/enums'
import { MailboxRepository } from '@agent/repositories'
import { OpenIssuesReader } from '../services/OpenIssuesReader'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { ThreadSteeredEvent } from '../events'
import type { ApplicationErrors } from '../errors'
```

```typescript
	constructor(
		private readonly threads: ThreadRepository,
		private readonly openIssues: OpenIssuesReader,
		private readonly mailbox: MailboxRepository,
	) {
		super()
	}
```

```typescript
		return this.withTransaction(tx, async tx => {
			// The WHISPER is recorded BY THE AGGREGATE (B4, decision 1) and persisted by `save` in this
			// same transaction — the id it returns is what the mailbox items below dedup on, so it has to
			// exist before anything references it, which is exactly why `recordEntry` mints synchronously.
			const entry = thread.recordEntry({ kind: TranscriptKind.WHISPER, text: input.text })
			await this.threads.save(thread, tx)

			await this.domainEventRepository.save(
				new ThreadSteeredEvent({
					entityId: thread.id.value,
					ownerId: thread.ownerId,
					payload: { threadId: thread.id.value, entryId: entry.entryId, text: input.text },
				}),
				tx,
			)
```

- [ ] O resto do corpo (`for (const issue of active)`, o bloco `if (active.length === 0)`, o `return { entryId: entry.entryId }`) permanece byte-idêntico

### Step T3.2 — Proposed file: Modify `packages/api/typescript/src/thread/usecases/SendDirectMessage.ts`

DIRECT sem sender, sem citação. Idem: sai `transcript`, o `save` entra ANTES do `enqueueCommand` (o comando referencia `entry.entryId` como `jobId`).

```typescript
import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError, CommandQueue } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { MessageAuthor, TranscriptKind } from '@codedm/contracts-typescript/wire/enums'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { ChannelConnectivity } from '../services/ChannelConnectivity'
import { DirectMessageSentEvent } from '../events'
import type { DeliverChannelMessage } from './DeliverChannelMessage'
import type { ApplicationErrors } from '../errors'
```

```typescript
	constructor(
		private readonly threads: ThreadRepository,
		private readonly connectivity: ChannelConnectivity,
		private readonly commands: CommandQueue,
	) {
		super()
	}
```

```typescript
		return this.withTransaction(tx, async tx => {
			const entry = thread.recordEntry({ kind: TranscriptKind.DIRECT, text: input.text })
			await this.threads.save(thread, tx)
```

- [ ] O `enqueueCommand<DeliverChannelMessage>('deliver_channel_message', {...}, { jobId: entry.entryId }, tx)` e o `DirectMessageSentEvent` permanecem byte-idênticos, incluindo todos os comentários do B3

### Step T3.3 — Proposed file: Modify `packages/api/typescript/src/thread/usecases/IngestChannelMessage.ts`

O caso da decisão D-B: é aqui que a citação é RESOLVIDA. A leitura já existia (`:67`, para calcular `repliesToAgent`); agora ela também alimenta a invariante, e sobe para antes do `recordEntry`.

```typescript
import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { MailboxItemKind, MailboxTargetKind, TranscriptKind } from '@codedm/contracts-typescript/wire/enums'
import { MailboxRepository } from '@agent/repositories'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { MessageIngestedEvent } from '../events'
import type { ApplicationErrors } from '../errors'
```

```typescript
	constructor(
		private readonly threads: ThreadRepository,
		private readonly mailbox: MailboxRepository,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const thread = await this.threads.findById(input.threadId)
		if (!thread) throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${input.threadId}`)

		return this.withTransaction(tx, async tx => {
			// THE CITATION, RESOLVED FIRST (B4, decision D-B). This lookup already existed — it is how
			// `repliesToAgent` is decided — and it now serves two purposes with one query: it tells us
			// whether the quote addresses the agent, and it is the PROOF of thread membership that
			// `recordEntry` demands. A quote that does not resolve degrades to no quote rather than being
			// written blind at a `quoted_entry_id` pointing nowhere, which is what happened before.
			const quoted = input.quotedEntryId ? await this.threads.findEntry(input.quotedEntryId, tx) : undefined

			// Is this a REPLY to something the agent itself said? `SYSTEM` is the kind
			// `RecordOrchestratorReply` writes, so it is exactly "the agent's own words", and quoting
			// those is addressing it — the mention gate stands down for that case (see `Thread.canInvoke`).
			// A quote that resolves to anyone else's message, or does not resolve at all, is not one.
			const repliesToAgent = quoted?.kind === TranscriptKind.SYSTEM

			// Always buffer + transcribe, even when the sender can't invoke (observation ≠ invocation).
			const entry = thread.recordEntry({
				kind: TranscriptKind.CONTACT,
				text: input.text,
				senderExternalId: input.senderExternalId,
				quotedEntry: quoted ? { entryId: quoted.entryId, threadId: quoted.threadId } : undefined,
				at: input.receivedAt,
			})
			await this.threads.save(thread, tx)

			const invocable = thread.canInvoke({ senderExternalId: input.senderExternalId, text: input.text, repliesToAgent })
```

- [ ] Todo o bloco `if (invocable) { await this.mailbox.enqueue(...) }`, o `MessageIngestedEvent` e o `return { entryId: entry.entryId, invocable }` permanecem byte-idênticos, com os comentários do REPOINT
- [ ] `save` vem ANTES do `canInvoke` porque `canInvoke` não persiste nada e o `enqueue` abaixo referencia `entry.entryId` — a ordem thread→entry→item é a que garante que um leitor que vê o item vê a entry

### Step T3.4 — Proposed file: Modify `packages/api/typescript/src/thread/usecases/RecordOrchestratorReply.ts`

SYSTEM sem sender, com citação que vem da wire. `replyToEntryId` é `z.string().optional()` de propósito (espelha a wire) — logo pode não resolver, e degrada.

```typescript
import { injectable } from 'tsyringe-neo'
import { Handler, z, CommandQueue } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { MessageAuthor, TranscriptKind } from '@codedm/contracts-typescript/wire/enums'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { ConsumedMessageRepository } from '../repositories/ConsumedMessageRepository'
import type { DeliverChannelMessage } from './DeliverChannelMessage'
```

```typescript
	constructor(
		private readonly threads: ThreadRepository,
		private readonly consumed: ConsumedMessageRepository,
		private readonly commands: CommandQueue,
	) {
		super()
	}
```

```typescript
		await this.withTransaction(tx, async tx => {
			// The citation, RESOLVED (B4, decision D-B). `replyToEntryId` mirrors the wire and is a plain
			// string, so it may well name nothing — and an unresolvable one now degrades to NO citation
			// instead of being written blind. That is the same posture the `quotedMessageId` lookup below
			// already takes, for the same reason: an unquoted answer is worth far more than a silence.
			const quoted = input.replyToEntryId ? await this.threads.findEntry(input.replyToEntryId, tx) : undefined

			const entry = thread.recordEntry({
				kind: TranscriptKind.SYSTEM,
				text: input.text,
				quotedEntry: quoted ? { entryId: quoted.entryId, threadId: quoted.threadId } : undefined,
			})
			await this.threads.save(thread, tx)
```

- [ ] O `quotedMessageId` (`this.consumed.findPlatformId(...)`), o `enqueueCommand` com `{ jobId: entry.entryId }` e todos os comentários do B3 permanecem byte-idênticos
- [ ] Atualizar o docblock da classe: a seção "Ordering" passa a dizer que a entry é gravada pelo agregado e que `save` a persiste na mesma transação

### Step T3.5 — Proposed file: Modify `packages/api/typescript/src/agent/usecases/RunOrchestratorTurn.ts`

O quinto consumidor, só-leitura (decisão 3). Perde uma injeção: `ThreadRepository` já estava lá.

Import fora:
```typescript
import { ThreadRepository } from '@thread/repositories'
```

Construtor sem `transcript`:
```typescript
	constructor(
		private readonly agent: OrchestratorAgent,
		private readonly runners: AgentRunnerFactory,
		private readonly providerDetector: ProviderDetector,
		private readonly sessions: AgentSessionRepository,
		private readonly threads: ThreadRepository,
		private readonly logging: LoggingService,
	) {
		super()
	}
```

`buildWindow`, primeira linha:
```typescript
	/**
	 * The conversation window a FRESH session is seeded with (§7.5) — the mechanism that would have died
	 * orphaned with `ClassifyMessage`, inherited here rather than reinvented.
	 *
	 * Reads through `ThreadRepository` (B4, decision 3): the window is a READ and stays outside the
	 * aggregate, but it is a read of the thread's OWN rows, so it is the thread repository's surface. One
	 * fewer injection than before, and no `DrizzleClient` in an agent use case.
	 */
	private async buildWindow(thread: LoadedThread) {
		const rows = await this.threads.recentEntries(thread.id.value, this.bufferLimit(thread.bufferSize))
```

- [ ] O `nameOf`, o `rows.map(...)` e todos os comentários (`you`, tag stripping, `addressed`) permanecem byte-idênticos — `TranscriptEntry` tem os mesmos campos que `TranscriptEntryRow` tinha (`kind`, `text`, `senderExternalId`)

### Step T3.6 — Deletar o repositório e desfazer o wiring

- [ ] `git rm -r packages/api/typescript/src/thread/repositories/TranscriptRepository`
- [ ] `packages/api/typescript/src/thread/registry.ts`: remover o import da linha 15 e o binding da linha 43 (`{ token: TranscriptRepository, mock: ..., real: ... }`)
- [ ] `packages/api/typescript/src/thread/repositories/index.ts`: remover o bloco de re-export das linhas 9-14
- [ ] `packages/api/typescript/src/shared/context-map.ts:40`: a nota passa a citar `ThreadRepository/OpenIssuesReader` (sai `TranscriptRepository`). Texto novo: `'The MailboxDispatcher resolves each turn run context — thread providers/workspaceId, and the conversation window — via BC4 read seams (ThreadRepository/OpenIssuesReader; the transcript window is the thread aggregate\'s own persistence surface since B4). ForkIssue slugs an issue key against the same reader (an open issue of a thread is a THREAD concept and lives there).'`

### Step T3.7 — Migrar as assertivas dos 9 arquivos de teste

Substituição mecânica, um padrão por chamada. **Nenhuma assertiva muda de sentido** — só de superfície.

| Antes | Depois |
|---|---|
| `testBed.resolve(TranscriptRepository).recentByThread(id, 10)` | `testBed.resolve(ThreadRepository).recentEntries(id, 10)` |
| `testBed.resolve(TranscriptRepository).listByThread(id)` | `testBed.resolve(ThreadRepository).listEntries(id)` |
| `import { TranscriptRepository } from '../repositories/TranscriptRepository'` | `import { ThreadRepository } from '../repositories/ThreadRepository'` |
| `import { TranscriptRepository } from '@thread/repositories/TranscriptRepository'` | `import { ThreadRepository } from '@thread/repositories/ThreadRepository'` |

- [ ] `src/thread/usecases/SendDirectMessage.test.ts:9,47`
- [ ] `src/thread/usecases/IngestChannelMessage.test.ts:8,42`
- [ ] `src/thread/usecases/RecordOrchestratorReply.test.ts:9,51,102`
- [ ] `src/thread/handlers/ConsumeInboundMessage.test.ts:9,74,90,114,145,173,180,195` — os `const transcript = testBed.resolve(TranscriptRepository)` das linhas 74/90/114 viram `const threads = testBed.resolve(ThreadRepository)`; conferir se algum desses usa `append` para SEED (se sim, o seed passa por `thread.recordEntry` + `threads.save`, nunca por um append solto)
- [ ] `src/thread/handlers/DeliverOrchestratorReply.test.ts:9,42`
- [ ] `tests/flows/inbound-routing.flow.test.ts:9,116,144,167`
- [ ] `tests/flows/agent-session-resume.flow.test.ts:8,103` — este arquivo SEED a janela; o seed passa a ser `thread.recordEntry(...)` × N + `threads.save(thread)`
- [ ] `tests/integration/redis-bridge.integration.test.ts:10,196`
- [ ] `tests/kernel/insert-site-audit.test.ts:44,166-174` — o caso `thread_transcript_entries` muda de nome e de caminho:

```typescript
	it('thread_transcript_entries — via ThreadRepository (id minted by the aggregate)', async () => {
		const thread = await givenThread(testBed, { ownerId: OWNER })
		thread.recordEntry({ kind: TranscriptKind.CONTACT, text: 'audit line', senderExternalId: 'contact-audit' })
		await testBed.resolve(ThreadRepository).save(thread)
		await assertLanded('thread_transcript_entries', ['id', 'at'])
	})
```

O nome do `it` muda porque a AFIRMAÇÃO mudou: o id não é mais "minted in the repository" — é minted no agregado, e esse é o ponto da frente.

### Step T3.8 — Verde e o grep do AC-4

- [ ] `cd packages/api/typescript && bun test src/thread tests/flows tests/integration tests/kernel` → 0 fail
- [ ] `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` → exit 0
- [ ] `grep -rn "TranscriptRepository" packages/api/typescript` → **vazio** (AC-4)
- [ ] `grep -rn "TranscriptRepository" packages/api packages/app packages/contracts` → vazio (nenhum consumidor fora do api-ts)

### Step T3.9 — Commit

```bash
git add packages/api/typescript/src/thread packages/api/typescript/src/agent/usecases/RunOrchestratorTurn.ts \
        packages/api/typescript/src/shared/context-map.ts packages/api/typescript/tests
git commit -m "refactor(thread,agent): B4 — TranscriptRepository morre; os 4 writers passam pelo agregado

SteerThread, SendDirectMessage, IngestChannelMessage e RecordOrchestratorReply
chamam thread.recordEntry + threads.save(thread, tx). IngestChannelMessage e
RecordOrchestratorReply resolvem a citacao ANTES (a leitura que o primeiro ja
fazia para repliesToAgent) e passam a referencia provada; citacao que nao
resolve degrada para sem-citacao em vez de gravar um ponteiro para o nada.

RunOrchestratorTurn le a janela por ThreadRepository.recentEntries — uma injecao
a menos no contexto agent. AC-4: grep TranscriptRepository vazio."
```

---

## Task T4: a tabela de stops troca de dono no schema e `issue_id` fica nullable

**Files to write:**
- Modify: `packages/contracts/db/schema-sqlite/issue.ts` — sai o bloco `stops`
- Modify: `packages/contracts/db/schema-sqlite/thread.ts` — entra o bloco `stops`, com `issueId` nullable
- Create: `packages/contracts/db/schema-sqlite/migrations/0007_<slug-gerado>.sql` — recreate-table do dialeto sqlite
- Create: `packages/contracts/db/schema-sqlite/migrations/meta/0007_snapshot.json`
- Modify: `packages/contracts/db/schema-sqlite/migrations/meta/_journal.json`
- Create: `packages/api/go/core/db/sqlite/migrations/0007_<slug-gerado>.sql` — cópia byte-idêntica (gerada por `db:sync-go`)
- Modify: `packages/api/go/core/db/sqlite/schema.sql` — dump regenerado

**Files to read:**
- `packages/contracts/db/schema-sqlite/migrations/0004_moaning_doomsday.sql` — o precedente EXATO: `NOT NULL` → nullable em `agent_agent_sessions.issue_id`, via recreate-table, e os dois índices únicos parciais que saíram disso
- `.claude/skills/migrate/SKILL.md` — a sequência canônica deste repo (não há `drizzle-kit migrate`; um só ledger `_sqlite_migrations`, chaveado por NOME de arquivo)
- `scripts/db/sync-sqlite-migrations.ts` — o gate de igualdade de bytes entre a fonte e a cópia `//go:embed`

**Agent:** database-architect
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /db-modelling, /migrate
**Depends on:** (none)
**Scope fence:** DONE: mover a DEFINIÇÃO de `stops` para o arquivo do contexto dono + `issue_id` nullable + migração + sync Go + dump do `schema.sql`. OUT: renomear a tabela física (decisão D-A — follow-up registrado), tocar `query/*.sql` do Go, rodar `sqlc generate` (o nome da tabela não muda, logo nada gerado pelo sqlc muda), e qualquer código TS (T5).
**Gate:** `bun run --cwd packages/contracts db:check-go && cd packages/api/typescript && bun scripts/dump-sqlite-schema.ts --check && bun test core/src/db/drivers/LibsqlDriver.test.ts` — exit 0 nos três

### Step T4.1 — Mover a definição, relaxar a coluna

Proposed file: Modify `packages/contracts/db/schema-sqlite/issue.ts` — **remover** o bloco `export const stops = sqliteTable('issue_stops', {...})` (linhas 72-99) e, do import da linha 2, remover `StopKind` e `StopResolution` (`noUnusedLocals` está ligado). O import fica:

```typescript
import { IssueStatus, ProviderKind, IssueArchiveReason } from '../../generated/typescript/src/wire/enums'
```

E o docblock do arquivo (linhas 5-10) perde a menção aos stops:

```typescript
/**
 * `issue` (pgSchema namespace) → `issue_*` table prefix. SQLite-dialect mirror of
 * db/schema/issue.ts. Issues as units of concurrent work — the terminal log and
 * the global stop-criteria config. The stops themselves moved to schema-sqlite/thread.ts
 * (B4): a Stop is a child of the THREAD aggregate, not of the Issue.
 * bigint→integer (terminal_lines.seq); enum→text + CHECK.
 */
```

Proposed file: Modify `packages/contracts/db/schema-sqlite/thread.ts` — o import da linha 2-9 ganha `StopKind` e `StopResolution`, e o bloco abaixo entra **depois** de `transcriptEntries` e antes de `consumedMessages`:

```typescript
/**
 * `issue_stops` — the human-in-the-loop stops. Defined HERE, in the thread schema, because a Stop is a
 * CHILD OF THE THREAD aggregate since B4 (spec decision 4): `Thread.raiseStop` / `Thread.resolveStop`
 * are the only writers, and `ThreadRepository.save` persists them in the thread's transaction.
 *
 * ### The physical name stays `issue_stops` (B4, decision D-A)
 * Ownership is expressed by this file, not by the prefix. The rename is a separate front: the Go side
 * reads this table from THREE hand-written sqlc query files (`core/db/sqlite/query/{issue,thread,ui}.sql`,
 * one of them an `UPDATE`) plus six generated ones, and drizzle-kit cannot infer a table rename — it
 * emits DROP + CREATE and, under `strict: true`, asks. The Drizzle symbol (`stops`) and the index names
 * (`stops_*_idx`) were already prefix-free, so nothing in TS reads the physical name at all.
 *
 * `issue_id` is NULLABLE (B4, spec decision 4). That is the whole point of the migration: a stop can be
 * raised at THREAD level — the orchestrator's needs-approval, before any issue exists — which was
 * unreachable while `RaiseStopInputSchema`/`AskOperatorInputSchema` demanded an `issueId`. Additive: no
 * backfill, every existing row already has one.
 */
export const stops = sqliteTable(
	'issue_stops',
	{
		id: text('id').primaryKey(),

		ownerId: text('owner_id').notNull(),
		issueId: text('issue_id'),
		threadId: text('thread_id').notNull(),

		// StopKind (SERVER_ERROR | BLOCKED_BY_CLASSIFICATION | HUMAN_REQUESTED | APPROVAL_NEEDED | AUTH_REQUIRED).
		kind: text('kind').$type<StopKind>().notNull(),
		title: text('title').notNull(),
		detail: text('detail').notNull(),
		raisedAt: integer('raised_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),

		// StopResolution (must match the kind) — null while open.
		resolution: text('resolution').$type<StopResolution>(),
		resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
	},
	t => [
		enumCheck('issue_stops_kind_check', t.kind, Object.values(StopKind)),
		enumCheck('issue_stops_resolution_check', t.resolution, Object.values(StopResolution)),
		index('stops_issue_id_idx').on(t.issueId),
		index('stops_thread_id_idx').on(t.threadId),
	],
)
```

- [ ] O nome dos dois CHECK e dos dois índices **não muda** — são constraints já aplicadas; renomeá-las só aumentaria o diff do rebuild
- [ ] Confirmar que o barrel `packages/contracts/db/schema-sqlite/index.ts` já faz `export * from './thread'` e `'./issue'` — logo `import { stops } from '@codedm/contracts/db'` continua resolvendo, e **zero arquivo TS muda por causa desta Task**

### Step T4.2 — Gerar a migração

```bash
bun migrate:create
```

Expected: `0007_<slug>.sql` novo em `packages/contracts/db/schema-sqlite/migrations/`, com o recreate-table dance do dialeto sqlite (SQLite não tem `ALTER COLUMN`) — a forma exata do precedente `0004_moaning_doomsday.sql`:

```sql
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_issue_stops` ( … issue_id text (sem NOT NULL) …, CONSTRAINT "issue_stops_kind_check" CHECK(…), CONSTRAINT "issue_stops_resolution_check" CHECK(…) );--> statement-breakpoint
INSERT INTO `__new_issue_stops`("id","owner_id","issue_id","thread_id","kind","title","detail","raised_at","resolution","resolved_at") SELECT "id","owner_id","issue_id","thread_id","kind","title","detail","raised_at","resolution","resolved_at" FROM `issue_stops`;--> statement-breakpoint
DROP TABLE `issue_stops`;--> statement-breakpoint
ALTER TABLE `__new_issue_stops` RENAME TO `issue_stops`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `stops_issue_id_idx` ON `issue_stops` (`issue_id`);--> statement-breakpoint
CREATE INDEX `stops_thread_id_idx` ON `issue_stops` (`thread_id`);
```

- [ ] **Revisar o SQL à mão** (Step 2 obrigatório da skill `/migrate`). Três coisas, e as três já morderam este repo:
  - o `INSERT ... SELECT` lista **todas** as 10 colunas dos dois lados (em `0004` uma coluna nova entrou como literal `NULL` e o dado morreu em silêncio)
  - os **dois CHECK** atravessam para a `__new_` (um rebuild que os perde para de validar o conjunto de valores)
  - os **dois índices** são recriados depois do `RENAME TO`
- [ ] Se drizzle-kit PERGUNTAR qualquer coisa (rename vs drop), **PARE** — significa que ele viu a tabela como nova, e isso só acontece se o nome físico mudou. Nome físico não muda nesta Task (decisão D-A).
- [ ] Nunca renomear um arquivo de migração já aplicado — o ledger `_sqlite_migrations` é chaveado por NOME

### Step T4.3 — Espelhar para o Go e regerar o `schema.sql`

```bash
bun run --cwd packages/contracts db:sync-go
cd packages/api/typescript && bun scripts/dump-sqlite-schema.ts
```

O primeiro copia `0007_*.sql` para `packages/api/go/core/db/sqlite/migrations/` (byte-idêntico; `meta/` deliberadamente não é copiado). O segundo aplica as migrações num sqlite temporário e re-dumpa `packages/api/go/core/db/sqlite/schema.sql`, que é o que o sqlc lê.

- [ ] **`sqlc generate` NÃO é necessário:** o nome da tabela e o conjunto de colunas não mudaram; só a nulabilidade de `issue_id`. Conferir com `git diff packages/api/go/core/db/sqlite/schema.sql` — a única mudança esperada é `"issue_id" text NOT NULL` → `"issue_id" text` dentro de `CREATE TABLE "issue_stops"`. Se o diff mostrar mais que isso, PARE.
- [ ] Se `sqlc` derivar tipo Go a partir da nulabilidade (`string` → `sql.NullString`), então `cd packages/api/go && sqlc generate` entra na Task e `go build ./...` entra no Gate. Verificar rodando `cd packages/api/go && go build ./...` ANTES de decidir.

### Step T4.4 — Gates

- [ ] `bun run --cwd packages/contracts db:check-go` → exit 0 (igualdade de bytes fonte↔cópia)
- [ ] `cd packages/api/typescript && bun scripts/dump-sqlite-schema.ts --check` → exit 0
- [ ] `cd packages/api/typescript && bun test core/src/db/drivers/LibsqlDriver.test.ts` → 0 fail (as migrações aplicam do zero)
- [ ] `cd packages/api/go && go test ./core/db/sqlite/...` → ok
- [ ] `bun tsc` → exit 0 (esperado: nada muda no TS, o símbolo `stops` só mudou de arquivo dentro do barrel)

### Step T4.5 — Commit

```bash
git add packages/contracts/db/schema-sqlite/issue.ts \
        packages/contracts/db/schema-sqlite/thread.ts \
        packages/contracts/db/schema-sqlite/migrations \
        packages/api/go/core/db/sqlite/migrations \
        packages/api/go/core/db/sqlite/schema.sql
git commit -m "feat(db): B4 — a tabela de stops muda de dono no schema e issue_id fica nullable

A definicao de \`stops\` sai de schema-sqlite/issue.ts e entra em thread.ts: uma
Stop e child do agregado Thread (spec decisao 4). issue_id deixa de ser NOT NULL
— e o que habilita o stop de nivel-thread (needs-approval do orquestrador), hoje
inalcancavel. Migracao aditiva, sem backfill; recreate-table porque o dialeto
sqlite nao tem ALTER COLUMN (precedente 0004_moaning_doomsday).

O nome fisico continua issue_stops (decisao D-A do plano): o Go le a tabela em 3
arquivos de query sqlc escritos a mao e drizzle-kit nao infere rename de tabela.
Rename fisico fica como follow-up com o passe sqlc."
```

---

## Task T5: `Thread.raiseStop` / `Thread.resolveStop` — a Stop passa a nascer e morrer no agregado

**Files to write:**
- Modify: `packages/api/typescript/src/thread/entities/Thread.ts` — `StopSchema`, `raiseStop`, `resolveStop`, acumuladores
- Modify: `packages/api/typescript/src/thread/entities/Thread.test.ts` — invariantes de stop
- Modify: `packages/api/typescript/src/thread/errors/index.ts` — codes de stop
- Move: `packages/api/typescript/src/issue/objects/StopResolutions.ts` → `packages/api/typescript/src/thread/objects/StopResolutions.ts`
- Move: `packages/api/typescript/src/issue/repositories/StopPolicyConfigRepository/` → `packages/api/typescript/src/thread/repositories/StopPolicyConfigRepository/`
- Create: `packages/api/typescript/src/thread/events/ThreadStopResolvedEvent.ts`
- Modify: `packages/api/typescript/src/thread/events/index.ts`
- Modify: `packages/api/typescript/src/thread/repositories/ThreadRepository/ThreadRepository.ts`
- Modify: `packages/api/typescript/src/thread/repositories/ThreadRepository/DrizzleThreadRepository.ts`
- Modify: `packages/api/typescript/src/thread/repositories/ThreadRepository/MockThreadRepository.ts`
- Modify: `packages/api/typescript/src/thread/repositories/ThreadRepository/DrizzleThreadRepository.test.ts` — AC-7
- Modify: `packages/api/typescript/src/thread/repositories/index.ts`
- Modify: `packages/api/typescript/src/thread/registry.ts`
- Modify: `packages/api/typescript/src/issue/repositories/index.ts`
- Modify: `packages/api/typescript/src/issue/registry.ts`
- Modify: `packages/api/typescript/src/issue/usecases/ResolveStop.ts` — ponte de um commit (import de `@thread/objects`)
- Modify: `packages/api/typescript/src/issue/usecases/GetNeedsYouPanel.ts` — ponte de um commit
- Modify: `packages/api/typescript/src/issue/usecases/RaiseStop.ts` — ponte de um commit (policy de `@thread/repositories`)
- Modify: `packages/api/typescript/src/ui/usecases/GetSettings.ts` — policy de `@thread/repositories`
- Modify: `packages/api/typescript/src/shared/context-map.ts`

**Files to read:**
- `packages/api/typescript/src/issue/repositories/StopRepository/StopRepository.ts` — `StopRow`/`RaiseStopInput`, a forma que `Stop` herda, e as 4 leituras (`findById`, `openByIssue`, `openByThread`)
- `packages/api/typescript/src/issue/events/IssueStopResolvedEvent.ts` — o domain event que migra
- `packages/api/typescript/src/issue/repositories/StopPolicyConfigRepository/StopPolicyConfigRepository.ts` — a justificativa da linha 19, que viaja com o arquivo

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** opus
**Skills:** /entity, /repository, /event, /errors, /test
**Depends on:** T3, T4
**Consumes (frozen):** de T1/T2, verbatim — `PendingThreadWrites`, `Thread.pullPendingWrites()`, `ThreadRepository.save(thread, tx)` e o `entryToPersistence`/`toEntry` de `DrizzleThreadRepository`. De T4, verbatim — a coluna `issue_stops.issue_id` NULLABLE e o símbolo `stops` exportado agora por `packages/contracts/db/schema-sqlite/thread.ts` (o specifier de import, `@codedm/contracts/db`, é o mesmo).
**Scope fence:** DONE: os métodos de stop no agregado, a persistência das stops pendentes, a migração de `StopResolutions` + `StopPolicyConfigRepository` + o domain event. OUT: mover use cases/controllers (T6) — `RaiseStop`/`ResolveStop` continuam usando `StopRepository` nesta Task; a morte de `StopRepository` é do T6. **Ponte consciente de UM commit:** três arquivos de `issue/` e um de `ui/` importam de `@thread/objects` / `@thread/repositories` ao final desta Task; T6 resolve fechando a migração. Registrar isso na mensagem de commit.
**Gate:** `cd packages/api/typescript && bun test src/thread && bun x tsc -p tsconfig.build.json --noEmit` — exit 0 nos dois

### Step T5.1 — Mover o vocabulário de resolução e a policy

- [ ] `git mv packages/api/typescript/src/issue/objects/StopResolutions.ts packages/api/typescript/src/thread/objects/StopResolutions.ts`
- [ ] Criar `packages/api/typescript/src/thread/objects/index.ts` com `export * from './StopResolutions'` (se `thread/objects/` ainda não existir); apagar `packages/api/typescript/src/issue/objects/index.ts` se ele ficar vazio, e o diretório com ele
- [ ] Acrescentar ao docblock de `StopResolutions.ts` a razão da mudança de endereço:

```typescript
/**
 * The per-kind resolution vocabulary — which `StopResolution`s are applicable to which `StopKind`.
 * Drives both the `Thread.resolveStop` invariant (`RESOLUTION_NOT_APPLICABLE`) and the T14 Needs-You
 * panel's `availableResolutions`. TAKE_OVER (hand the conversation to the human, pausing the thread)
 * applies to every stop; APPROVE/DENY are exclusive to APPROVAL_NEEDED.
 *
 * Lives in `thread/` since B4: the Stop is a child of the Thread aggregate, and the applicability rule
 * is an invariant `Thread.resolveStop` enforces — so the table has to sit inside the context that owns
 * the aggregate raising it, not in the one that used to own the table.
 */
```

- [ ] `git mv packages/api/typescript/src/issue/repositories/StopPolicyConfigRepository packages/api/typescript/src/thread/repositories/StopPolicyConfigRepository`
- [ ] `packages/api/typescript/src/thread/repositories/index.ts`: acrescentar o re-export do `StopPolicyConfigRepository` (interface + `Drizzle*` + `Mock*` + `StopPolicy` + `DEFAULT_STOP_POLICY`)
- [ ] `packages/api/typescript/src/issue/repositories/index.ts`: remover o bloco de re-export das linhas 4-9
- [ ] `packages/api/typescript/src/thread/registry.ts`: acrescentar `{ token: StopPolicyConfigRepository, mock: MockStopPolicyConfigRepository, real: DrizzleStopPolicyConfigRepository }`
- [ ] `packages/api/typescript/src/issue/registry.ts`: remover o import (linhas 7-11) e o binding (linha 17)
- [ ] Re-apontar os três importadores: `issue/usecases/RaiseStop.ts` e `ui/usecases/GetSettings.ts:7` passam a `import { StopPolicyConfigRepository } from '@thread/repositories/StopPolicyConfigRepository'`; `issue/usecases/UpdateStopCriteriaConfig.ts:4` idem
- [ ] `shared/context-map.ts:53`: a nota do par `issue` sai; a do par `thread` passa a dizer `'BFF Settings reads the per-owner stop-policy toggles via StopPolicyConfigRepository (repositories surface), which lives in thread/ since B4 — the policy follows the aggregate that raises stops.'`

A justificativa "demoted from an aggregate to a settings row" viaja no arquivo e ganha o endereço certo — é a correção do achado (b) do inventário: ela era boa e estava no lugar errado (no próprio repositório, sem agregado pai em `issue/` para hospedá-la). Acrescentar ao docblock da abstract class:

```typescript
/**
 * The global (per-owner) stop-criteria toggles — demoted from an aggregate to a settings row.
 *
 * Lives in `thread/` since B4. A settings row has no parent aggregate to justify it in, which is why
 * this justification sits on the repository itself; what B4 fixes is the ADDRESS — the policy now sits
 * in the context that owns the stops it gates, and `Thread.raiseStop`'s caller reads it from here.
 */
```

### Step T5.2 — Scaffold + Proposed file: Create `packages/api/typescript/src/thread/events/ThreadStopResolvedEvent.ts`

```bash
bun cli event thread ThreadStopResolved --print
```

O gerador emite `<Pascal>Event.ts` e insere o `export *` no barrel — usar `--print` para conferir a forma canônica e escrever o arquivo abaixo (o nome final é `ThreadStopResolvedEvent.ts`, sem duplicar o sufixo).

COMPLETE file:

```typescript
import { BaseDomainEvent, z } from '@codedm/core-typescript'
import { StopResolution } from '@codedm/contracts-typescript/wire/enums'

/**
 * A stop was resolved by the operator. Raised by `Thread.resolveStop` and bridged to
 * `integration.thread.stop_resolved` by `PublishThreadIntegrationEvents` (TAKE_OVER additionally pauses
 * the thread).
 *
 * Renamed and relocated from `issue/events/IssueStopResolvedEvent` in B4: events live in the context
 * that owns the aggregate raising them, and since spec decision 4 the Stop is a child of `Thread`.
 *
 * `issueId` is OPTIONAL, mirroring the column: a thread-level stop (the orchestrator's needs-approval,
 * before any issue exists) has none. `threadId` is always present — it is the aggregate's id.
 */
export const ThreadStopResolvedEventSchema = z.domainEvent({
	stopId: z.string(),
	issueId: z.string().optional(),
	threadId: z.string(),
	resolution: z.enum(StopResolution),
})
export class ThreadStopResolvedEvent extends BaseDomainEvent<typeof ThreadStopResolvedEventSchema> {
	static override readonly name = 'thread.stop_resolved' as const
	static readonly schema = ThreadStopResolvedEventSchema
}
```

- [ ] `packages/api/typescript/src/thread/events/index.ts`: acrescentar `export { ThreadStopResolvedEvent, ThreadStopResolvedEventSchema } from './ThreadStopResolvedEvent'`
- [ ] `issue/events/IssueStopResolvedEvent.ts` **continua existindo** nesta Task (o `ResolveStop` de `issue/` ainda o levanta); morre no T6

### Step T5.3 — Proposed file: Modify `packages/api/typescript/src/thread/entities/Thread.ts`

Blocos ACRESCENTADOS ao arquivo do T1. Novos imports (`StopKind`, `StopResolution` em `wire/enums`; `isResolutionApplicable` de `../objects/StopResolutions`; `ThreadStopResolvedEvent` de `../events/ThreadStopResolvedEvent`), o schema, os acumuladores, os dois métodos e o `pullPendingWrites` estendido:

```typescript
import { isResolutionApplicable } from '../objects/StopResolutions'
import { ThreadStopResolvedEvent } from '../events/ThreadStopResolvedEvent'
```

```typescript
/**
 * A stop — a CHILD RECORD of `Thread` (B4, spec decision 4), not an entity and no longer a child of
 * `Issue`.
 *
 * ### `issueId` is OPTIONAL, and that is the whole reason this moved
 * While the Stop hung off `Issue` with a mandatory `issueId`, a thread-level stop was UNREACHABLE:
 * `RaiseStopInputSchema` and `AskOperatorInputSchema` both demanded one, so the orchestrator could never
 * ask for approval before an issue existed. Re-parenting to `Thread` closes that hole by MODELLING
 * rather than by relaxing a validator: the thread is the aggregate that always exists.
 *
 * It also fixes where `ownerId` comes from. `RaiseStop` used to read it off `issue.ownerId` — impossible
 * for a raise with no issue. It is stamped from the aggregate here, which is the one place that always
 * knows it.
 */
export const StopSchema = z.object({
	stopId: z.uuid(),
	ownerId: z.uuid(),
	issueId: z.string().optional(),
	threadId: z.uuid(),
	kind: z.enum(StopKind),
	title: z.string().min(1),
	detail: z.string(),
	raisedAt: z.date(),
	resolution: z.enum(StopResolution).optional(),
	resolvedAt: z.date().optional(),
})

/** The UPDATE half of a resolution: `save` stamps these two columns on an already-persisted stop. */
export const StopResolutionPatchSchema = z.object({
	stopId: z.uuid(),
	resolution: z.enum(StopResolution),
	resolvedAt: z.date(),
})

export type Stop = Z.infer<typeof StopSchema>
export type StopResolutionPatch = Z.infer<typeof StopResolutionPatchSchema>
```

`PendingThreadWrites` cresce:

```typescript
/** What `ThreadRepository.save` drains and writes in the SAME transaction as the thread row. */
export interface PendingThreadWrites {
	entries: TranscriptEntry[]
	stops: Stop[]
	stopResolutions: StopResolutionPatch[]
}
```

Acumuladores, ao lado de `pendingEntries`:

```typescript
	private pendingStops: Stop[] = []
	private pendingStopResolutions: StopResolutionPatch[] = []
```

Os dois métodos, depois de `recordEntry`:

```typescript
	/**
	 * Raise a stop on this thread (B4, spec decision 4) — with or without an issue behind it.
	 *
	 * `stopId` is accepted rather than always minted because the id is frequently DECIDED UPSTREAM: the
	 * terminal engine's `integration.thread.stop_raised` carries one, and honouring it is what makes a
	 * redelivered fact land on the same row instead of a second Needs-you card. When the producer has
	 * none (the console path), one is minted here.
	 *
	 * What this method is FOR, since it enforces no state transition: identity and OWNERSHIP. `ownerId`
	 * and `threadId` are stamped from the aggregate, which is exactly the bug the re-parenting fixes —
	 * `RaiseStop` derived `ownerId` from `issue.ownerId`, and a stop with no issue had nowhere to get it.
	 *
	 * It raises NO domain event. The fact `integration.thread.stop_raised` is the CAUSE of this call, not
	 * its effect: it is published upstream by `PublishAgentIntegrationEvents` from
	 * `AgentRunStopRaisedEvent`, and this is the consumer materializing it. Re-announcing it here would
	 * be a loop.
	 */
	raiseStop(input: { stopId?: string; issueId?: string; kind: StopKind; title: string; detail: string }): Stop {
		const stop: Stop = {
			stopId: input.stopId ?? Id.value(),
			ownerId: this.ownerId,
			issueId: input.issueId,
			threadId: this.id.value,
			kind: input.kind,
			title: input.title,
			detail: input.detail,
			raisedAt: new Date(),
			resolution: undefined,
			resolvedAt: undefined,
		}
		this.pendingStops.push(stop)
		return stop
	}

	/**
	 * Resolve a stop of this thread (B4, spec decision 4).
	 *
	 * Takes the LOADED stop rather than an id, for the same reason `recordEntry` takes a resolved
	 * citation: the aggregate does no I/O, and `findById` does not hydrate children. The caller reads it
	 * with `ThreadRepository.findStop` and hands it over; the aggregate then owns all three invariants,
	 * one of which (`RESOLUTION_NOT_APPLICABLE`) used to be an application-level check inside the use
	 * case — it is a rule about the stop, so it is a DomainError now.
	 *
	 * Unlike `raiseStop` this DOES raise a domain event, and the asymmetry is the point: a resolution is
	 * a decision this system made, so `thread.stop_resolved` is a fact it authors and
	 * `PublishThreadIntegrationEvents` bridges. `pullDomainEvents()` — the mechanism `BaseEntity` has
	 * always exposed and no TypeScript aggregate had used yet (the Go `Channel` uses its twin) — is
	 * drained by the use case inside the same transaction as the write.
	 */
	resolveStop(stop: Stop, resolution: StopResolution): void {
		if (stop.threadId !== this.id.value) {
			throw new BaseError<DomainErrors>('STOP_NOT_IN_THREAD', `stop ${stop.stopId} belongs to thread ${stop.threadId}`)
		}
		if (stop.resolvedAt) {
			throw new BaseError<DomainErrors>('STOP_ALREADY_RESOLVED', `stop ${stop.stopId} was resolved at ${stop.resolvedAt.toISOString()}`)
		}
		if (!isResolutionApplicable(stop.kind, resolution)) {
			throw new BaseError<DomainErrors>('RESOLUTION_NOT_APPLICABLE', `${resolution} does not apply to a ${stop.kind} stop`)
		}

		this.pendingStopResolutions.push({ stopId: stop.stopId, resolution, resolvedAt: new Date() })
		this.addDomainEvent(
			new ThreadStopResolvedEvent({
				entityId: this.id.value,
				ownerId: this.ownerId,
				payload: { stopId: stop.stopId, issueId: stop.issueId, threadId: this.id.value, resolution },
			}),
		)
	}
```

`pullPendingWrites` dreno completo:

```typescript
	pullPendingWrites(): PendingThreadWrites {
		const writes: PendingThreadWrites = {
			entries: this.pendingEntries,
			stops: this.pendingStops,
			stopResolutions: this.pendingStopResolutions,
		}
		this.pendingEntries = []
		this.pendingStops = []
		this.pendingStopResolutions = []
		return writes
	}
```

- [ ] O docblock da classe ganha um parágrafo sobre o stop, e a linha `The transcript + pending clarifications are separate entities/records, not embedded here.` já saiu no T1

### Step T5.4 — Proposed file: Modify `packages/api/typescript/src/thread/errors/index.ts`

Dois códigos novos de domínio (`RESOLUTION_NOT_APPLICABLE` migra de application-error de `issue/` para domain-error de `thread/`, com o MESMO status 422 — um código, um significado):

```typescript
	// Stop invariants (B4, spec decision 4) — the Stop is a child of this aggregate.
	| 'STOP_NOT_IN_THREAD'
	| 'STOP_ALREADY_RESOLVED'
	| 'RESOLUTION_NOT_APPLICABLE'
```

```typescript
	STOP_NOT_IN_THREAD: HttpStatusCode.UNPROCESSABLE_ENTITY,
	STOP_ALREADY_RESOLVED: HttpStatusCode.UNPROCESSABLE_ENTITY,
	RESOLUTION_NOT_APPLICABLE: HttpStatusCode.UNPROCESSABLE_ENTITY,
```

`STOP_NOT_FOUND` e `STOP_CRITERION_DISABLED` chegam no T6, quando os use cases que os levantam migram — são ApplicationErrors, não invariantes.

### Step T5.5 — Proposed file: Modify o `ThreadRepository` (interface, Drizzle, Mock)

Na interface, depois das leituras de entry:

```typescript
	// ── Child reads: the stops this aggregate owns ─────────────────────────────────────────────────

	/** One stop by id — how a caller loads what it will hand to `Thread.resolveStop`. */
	abstract findStop(stopId: string, tx?: Transaction): Promise<Stop | undefined>
	/** Unresolved stops on a thread — WITH and WITHOUT an issue (that is the point of decision 4). */
	abstract openStops(threadId: string, tx?: Transaction): Promise<Stop[]>
	/** Unresolved stops of one issue. Survives for the issue-detail read and the lifecycle tests. */
	abstract openStopsByIssue(issueId: string, tx?: Transaction): Promise<Stop[]>
```

No `DrizzleThreadRepository.save`, dentro do mesmo `tryCatchAsync`, depois do insert das entries:

```typescript
			if (stops_.length > 0) {
				await dbc.insert(stops).values(stops_.map(stop => this.stopToPersistence(stop)))
			}
			// The resolution is an UPDATE of a row that already committed — the caller loaded it with
			// `findStop`, so it exists. One statement per resolution: a single resolve per request is the
			// only shape the product has, and a CASE-based bulk update would be machinery for nobody.
			for (const patch of stopResolutions) {
				await dbc
					.update(stops)
					.set({ resolution: patch.resolution, resolvedAt: patch.resolvedAt })
					.where(eq(stops.id, patch.stopId))
			}
```

com o dreno reescrito como `const { entries, stops: stops_, stopResolutions } = entity.pullPendingWrites()` (o alias evita sombrear o símbolo Drizzle `stops`), e os mapeadores:

```typescript
	private stopToPersistence(stop: Stop): typeof stops.$inferInsert {
		return {
			id: stop.stopId,
			ownerId: stop.ownerId,
			issueId: stop.issueId ?? null,
			threadId: stop.threadId,
			kind: stop.kind,
			title: stop.title,
			detail: stop.detail,
			raisedAt: stop.raisedAt,
			resolution: stop.resolution ?? null,
			resolvedAt: stop.resolvedAt ?? null,
		}
	}

	// No casts, same reason as `toEntry`: `issue_stops.kind` and `.resolution` carry `$type<…>()`.
	private toStop(row: typeof stops.$inferSelect): Stop {
		return {
			stopId: row.id,
			ownerId: row.ownerId,
			issueId: row.issueId ?? undefined,
			threadId: row.threadId,
			kind: row.kind,
			title: row.title,
			detail: row.detail,
			raisedAt: row.raisedAt,
			resolution: row.resolution ?? undefined,
			resolvedAt: row.resolvedAt ?? undefined,
		}
	}
```

e as três leituras:

```typescript
	async findStop(stopId: string, tx?: DrizzleClient): Promise<Stop | undefined> {
		const dbc = tx ?? this.db
		const rows = await dbc.select().from(stops).where(eq(stops.id, stopId)).limit(1)
		return rows[0] ? this.toStop(rows[0]) : undefined
	}

	async openStops(threadId: string, tx?: DrizzleClient): Promise<Stop[]> {
		const dbc = tx ?? this.db
		const rows = await dbc.select().from(stops).where(and(eq(stops.threadId, threadId), isNull(stops.resolvedAt)))
		return rows.map(row => this.toStop(row))
	}

	async openStopsByIssue(issueId: string, tx?: DrizzleClient): Promise<Stop[]> {
		const dbc = tx ?? this.db
		const rows = await dbc.select().from(stops).where(and(eq(stops.issueId, issueId), isNull(stops.resolvedAt)))
		return rows.map(row => this.toStop(row))
	}
```

- [ ] Imports do Drizzle: `isNull` entra; `stops` entra no import de `@codedm/contracts/db`; `StopKind`/`StopResolution` entram no import de tipos de `wire/enums`
- [ ] `MockThreadRepository`: `private stopRows: Stop[] = []`, `save` faz `this.stopRows.push(...stops)` e aplica cada `stopResolutions` sobre a linha correspondente; as três leituras filtram o array

### Step T5.6 — Proposed file: Modify `packages/api/typescript/src/thread/entities/Thread.test.ts` + o teste de repositório

APPEND ao `Thread.test.ts`:

```typescript
/**
 * B4 spec decision 4 — the Stop as a child of the Thread. Pure entity, no DB.
 *
 * The first case is the one the whole re-parenting exists for: it was UNREACHABLE before, because both
 * `RaiseStopInputSchema` and `AskOperatorInputSchema` demanded an `issueId`.
 */
describe('Thread.raiseStop / resolveStop — a stop belongs to the thread, with or without an issue', () => {
	const threadOf = () =>
		Thread.create({
			ownerId: OWNER_ID,
			channelId: CHANNEL_ID,
			contactRef: { externalId: 'contact-1', displayName: 'Contact', kind: ContactKind.USER },
			workspaceId: WORKSPACE_ID,
			providers: [ProviderKind.CLAUDE_CODE],
			mentionTag: '@ws',
			participants: [{ participantId: 'operator', name: 'Operator', source: 'console', canInvoke: true }],
		})

	it('US-5 — a stop with NO issue is raised, and carries the owner + thread from the aggregate', () => {
		const thread = threadOf()

		const stop = thread.raiseStop({ kind: StopKind.HUMAN_REQUESTED, title: 'preciso de você', detail: '' })

		expect(stop.issueId).toBeUndefined()
		expect(stop.ownerId).toBe(thread.ownerId)
		expect(stop.threadId).toBe(thread.id.value)
		expect(thread.pullPendingWrites().stops).toHaveLength(1)
	})

	it('honours a stopId decided upstream — a redelivered fact lands on the same row', () => {
		const thread = threadOf()
		const stopId = '019e4d24-6524-7041-9e1c-8108180cddb1'

		expect(thread.raiseStop({ stopId, kind: StopKind.APPROVAL_NEEDED, title: 't', detail: 'd' }).stopId).toBe(stopId)
	})

	it('raiseStop raises NO domain event — the integration fact is its CAUSE, not its effect', () => {
		const thread = threadOf()

		thread.raiseStop({ kind: StopKind.SERVER_ERROR, title: 't', detail: 'd' })

		expect(thread.pullDomainEvents()).toHaveLength(0)
	})

	it('FALSEADOR — resolving a stop of ANOTHER thread is rejected', () => {
		const threadA = threadOf()
		const threadB = threadOf()
		const stop = threadA.raiseStop({ kind: StopKind.APPROVAL_NEEDED, title: 't', detail: 'd' })

		expect(() => threadB.resolveStop(stop, StopResolution.APPROVE)).toThrow('STOP_NOT_IN_THREAD')
		expect(threadB.pullPendingWrites().stopResolutions).toHaveLength(0)
	})

	it('FALSEADOR — a resolution that does not apply to the kind is rejected (APPROVE only on APPROVAL_NEEDED)', () => {
		const thread = threadOf()
		const serverError = thread.raiseStop({ kind: StopKind.SERVER_ERROR, title: 't', detail: 'd' })

		expect(() => thread.resolveStop(serverError, StopResolution.APPROVE)).toThrow('RESOLUTION_NOT_APPLICABLE')
		// TAKE_OVER applies to every kind — the guard rejects the wrong pair, not every pair.
		thread.resolveStop(serverError, StopResolution.TAKE_OVER)
		expect(thread.pullPendingWrites().stopResolutions).toHaveLength(1)
	})

	it('FALSEADOR — resolving an already-resolved stop is rejected', () => {
		const thread = threadOf()
		const resolved = { ...thread.raiseStop({ kind: StopKind.SERVER_ERROR, title: 't', detail: 'd' }), resolvedAt: new Date() }

		expect(() => thread.resolveStop(resolved, StopResolution.RETRY)).toThrow('STOP_ALREADY_RESOLVED')
	})

	it('resolveStop raises thread.stop_resolved, carrying threadId always and issueId only when there is one', () => {
		const thread = threadOf()
		const withoutIssue = thread.raiseStop({ kind: StopKind.HUMAN_REQUESTED, title: 't', detail: 'd' })

		thread.resolveStop(withoutIssue, StopResolution.TAKE_OVER)

		const [event] = thread.pullDomainEvents()
		expect(event).toBeInstanceOf(ThreadStopResolvedEvent)
		expect((event as ThreadStopResolvedEvent).payload).toMatchObject({
			stopId: withoutIssue.stopId,
			threadId: thread.id.value,
			resolution: StopResolution.TAKE_OVER,
		})
		expect((event as ThreadStopResolvedEvent).payload.issueId).toBeUndefined()
	})
})
```

APPEND ao `DrizzleThreadRepository.test.ts`:

```typescript
	it('AC-7 — save persists a stop with issue_id NULL, and the read returns it', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })

		const stop = thread.raiseStop({ kind: StopKind.HUMAN_REQUESTED, title: 'preciso de você', detail: 'a pergunta' })
		await driver.transaction(tx => repo.save(thread, tx))

		const row = (await db.select().from(stops).where(eq(stops.id, stop.stopId)))[0]
		expect(row).toBeDefined()
		expect(row!.issueId).toBeNull()
		expect(await repo.openStops(thread.id.value)).toHaveLength(1)
	})

	it('AC-7 — resolveStop stamps resolution + resolvedAt regardless of whether the stop has an issue', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const stop = thread.raiseStop({ kind: StopKind.APPROVAL_NEEDED, title: 't', detail: 'd' })
		await driver.transaction(tx => repo.save(thread, tx))

		const loaded = await repo.findStop(stop.stopId)
		thread.resolveStop(loaded!, StopResolution.APPROVE)
		await driver.transaction(tx => repo.save(thread, tx))

		expect(await repo.openStops(thread.id.value)).toHaveLength(0)
		expect((await repo.findStop(stop.stopId))!.resolution).toBe(StopResolution.APPROVE)
	})

	it('AC-3 — the stop and the thread roll back together', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		thread.raiseStop({ kind: StopKind.SERVER_ERROR, title: 't', detail: 'd' })

		await expect(
			driver.transaction(async tx => {
				await repo.save(thread, tx)
				throw new Error('rollback')
			}),
		).rejects.toThrow('rollback')

		expect(await repo.openStops(thread.id.value)).toHaveLength(0)
	})
```

### Step T5.7 — Verde

- [ ] `cd packages/api/typescript && bun test src/thread` → 0 fail
- [ ] `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` → exit 0
- [ ] **Provar que o gate pode falhar:** comentar o guard `STOP_NOT_IN_THREAD`, rodar → o `it` correspondente fica vermelho. Descomentar.
- [ ] `cd packages/api/typescript && bun test` → 0 fail (nada regride; `StopRepository` continua vivo e com seus consumidores)

### Step T5.8 — Commit

```bash
git add packages/api/typescript/src/thread packages/api/typescript/src/issue \
        packages/api/typescript/src/ui/usecases/GetSettings.ts \
        packages/api/typescript/src/shared/context-map.ts
git commit -m "feat(thread): B4 — a Stop nasce e morre no agregado Thread

StopSchema/raiseStop/resolveStop entram no agregado; issueId e OPCIONAL, o que
torna alcancavel o stop de nivel-thread (needs-approval do orquestrador) — hoje
impossivel porque RaiseStopInputSchema e AskOperatorInputSchema exigem issueId.
ownerId passa a ser estampado pelo agregado em vez de derivado de issue.ownerId.

resolveStop e o PRIMEIRO usuario TS de addDomainEvent/pullDomainEvents (o gemeo
Go ja usava) e leva RESOLUTION_NOT_APPLICABLE de ApplicationError para invariante
de dominio. raiseStop nao levanta evento: integration.*.stop_raised e a CAUSA da
chamada, publicada upstream pelo publisher do contexto agent.

StopResolutions e StopPolicyConfigRepository migram para thread/ (emenda do
founder + a regra de tabela-filha: a justificativa acompanha o dono). PONTE de um
commit: RaiseStop/ResolveStop/GetNeedsYouPanel de issue/ e GetSettings de ui/
importam de @thread/* aqui; T6 fecha a migracao."
```

---

## Task T6: o control-plane de stop muda de contexto e `StopRepository` morre

**Files to write:**
- Move: `packages/api/typescript/src/issue/usecases/RaiseStop.ts` → `packages/api/typescript/src/thread/usecases/RaiseStop.ts`
- Move: `packages/api/typescript/src/issue/usecases/ResolveStop.ts` → `packages/api/typescript/src/thread/usecases/ResolveStop.ts`
- Move: `packages/api/typescript/src/issue/usecases/UpdateStopCriteriaConfig.ts` → `packages/api/typescript/src/thread/usecases/UpdateStopCriteriaConfig.ts`
- Move: `packages/api/typescript/src/issue/usecases/GetNeedsYouPanel.ts` → `packages/api/typescript/src/thread/usecases/GetNeedsYouPanel.ts`
- Move: `packages/api/typescript/src/issue/controllers/ResolveStop.ts` → `packages/api/typescript/src/thread/controllers/ResolveStop.ts`
- Move: `packages/api/typescript/src/issue/controllers/UpdateStopCriteria.ts` → `packages/api/typescript/src/thread/controllers/UpdateStopCriteria.ts`
- Move: `packages/api/typescript/src/issue/controllers/GetNeedsYouPanel.ts` → `packages/api/typescript/src/thread/controllers/GetNeedsYouPanel.ts`
- Create: `packages/api/typescript/src/thread/handlers/RecordStopFromExecution.ts`
- Delete: `packages/api/typescript/src/issue/repositories/StopRepository/StopRepository.ts`
- Delete: `packages/api/typescript/src/issue/repositories/StopRepository/DrizzleStopRepository.ts`
- Delete: `packages/api/typescript/src/issue/repositories/StopRepository/MockStopRepository.ts`
- Delete: `packages/api/typescript/src/issue/repositories/StopRepository/index.ts`
- Delete: `packages/api/typescript/src/issue/events/IssueStopResolvedEvent.ts`
- Modify: `packages/api/typescript/src/issue/events/index.ts`
- Modify: `packages/api/typescript/src/issue/handlers/MaterializeIssueFromExecution.ts`
- Modify: `packages/api/typescript/src/issue/handlers/PublishIssueIntegrationEvents.ts`
- Modify: `packages/api/typescript/src/thread/handlers/PublishThreadIntegrationEvents.ts`
- Modify: `packages/api/typescript/src/thread/handlers/external.ts`
- Modify: `packages/api/typescript/src/thread/handlers/internal.ts`
- Modify: `packages/api/typescript/src/issue/usecases/index.ts`
- Modify: `packages/api/typescript/src/issue/controllers/index.ts`
- Modify: `packages/api/typescript/src/thread/usecases/index.ts`
- Modify: `packages/api/typescript/src/thread/controllers/index.ts`
- Modify: `packages/api/typescript/src/issue/registry.ts`
- Modify: `packages/api/typescript/src/issue/repositories/index.ts`
- Modify: `packages/api/typescript/src/issue/errors/index.ts`
- Modify: `packages/api/typescript/src/thread/errors/index.ts`
- Modify: `packages/api/typescript/src/issue/usecases/IssueLifecycle.test.ts`
- Modify: `packages/api/typescript/tests/support/given/stops.ts`
- Modify: `packages/api/typescript/tests/flows/stop-control-plane.flow.test.ts`
- Modify: `packages/api/typescript/tests/kernel/insert-site-audit.test.ts`
- Modify: `packages/api/typescript/src/shared/context-map.ts`

**Files to read:**
- `docs/BACKEND.md:134-175` — Dependency Direction: `:170` proíbe importar entidade/domain event de outro contexto, `:173` e `:414` restringem mudar o estado de outro contexto a integration event. É o que força esta Task.
- `packages/api/typescript/src/issue/handlers/MaterializeIssueFromExecution.ts:79-110` — a branch de stop que atravessa, com o `STOP_TITLES` e a lista de swallow
- `packages/api/typescript/src/thread/handlers/PublishThreadIntegrationEvents.ts` — a exceção nomeada do B3, que ganha o segundo fato

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** opus
**Skills:** /usecase, /controller, /handler, /errors, /query, /test
**Depends on:** T5
**Consumes (frozen):** de T5, verbatim — `Thread.raiseStop({ stopId?, issueId?, kind, title, detail }): Stop`, `Thread.resolveStop(stop: Stop, resolution: StopResolution): void`, `ThreadRepository.findStop / openStops / openStopsByIssue`, `Stop` de `@thread/entities/Thread`, `ThreadStopResolvedEvent` (`thread.stop_resolved`) de `@thread/events`, `isResolutionApplicable` / `resolutionsForKind` de `@thread/objects/StopResolutions`, e `StopPolicyConfigRepository` / `StopPolicy` / `DEFAULT_STOP_POLICY` de `@thread/repositories/StopPolicyConfigRepository`.
**Scope fence:** DONE: os 4 use cases + 3 controllers + errors + evento + publisher + o handler externo novo + a morte de `StopRepository`. **DUAS APERTADAS NOMEADAS**, ambas em arquivos que esta Task reescreve por inteiro, ambas espelhando um irmão existente, ambas surgidas do `bun scripts/review-plan.ts` deste plano — declaradas aqui para o reviewer de conformidade as ler como intenção e não como scope creep: (i) `RaiseStop` ganha retorno-antecipado idempotente por `stopId` (o fato é at-least-once e a redelivery batia na primary key, dead-letterando o sinal de needs-you; é a forma que `OpenIssue` já usa); (ii) `GetNeedsYouPanel` passa a filtrar por `ownerId`, que já estava no input, já vinha do `ctx` e já estava sendo ignorado (o irmão `GetSessionChat` guarda; este vazava stops de outro owner para quem soubesse um thread id). OUT: o contrato (T7) — esta Task continua consumindo `IssueStopRaisedEvent` e publicando `IssueStopResolvedEvent` (integration) com os nomes ANTIGOS; nenhum `.tsp` é tocado aqui. `GetIssueDetail` fica em `issue/` (é read de issue que junta stops; a coluna nullable não a quebra, ela só deixa de ver stops sem issue — comportamento esperado). NENHUM path HTTP muda.
**Gate:** `cd packages/api/typescript && bun test && bun x tsc -p tsconfig.build.json --noEmit && bun lint` — exit 0 nos três, e `grep -rn "StopRepository" packages/api/typescript | grep -v StopPolicyConfigRepository` retorna vazio (AC-8)

### Step T6.1 — Proposed file: Modify (após `git mv`) `packages/api/typescript/src/thread/usecases/RaiseStop.ts`

```bash
git mv packages/api/typescript/src/issue/usecases/RaiseStop.ts packages/api/typescript/src/thread/usecases/RaiseStop.ts
```

COMPLETE final file:

```typescript
import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { StopKind } from '@codedm/contracts-typescript/wire/enums'
import { IssueRepository } from '@issue/repositories/IssueRepository'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { StopPolicyConfigRepository, type StopPolicy } from '../repositories/StopPolicyConfigRepository'
import type { ApplicationErrors } from '../errors'

export const RaiseStopInputSchema = z.object({
	stopId: z.uuid(),
	threadId: z.uuid(),
	/**
	 * OPTIONAL since B4 (spec decision 4) — and this single character is the feature. A stop with no
	 * issue is the orchestrator's needs-approval, raised before any issue exists; while this key was
	 * required the case was unreachable no matter what the aggregate allowed.
	 */
	issueId: z.uuid().optional(),
	kind: z.enum(StopKind),
	title: z.string(),
	detail: z.string(),
})

export const RaiseStopOutputSchema = z.object({ stopId: z.uuid() })

const POLICY_KEY: Record<StopKind, keyof StopPolicy> = {
	[StopKind.SERVER_ERROR]: 'serverErrors',
	[StopKind.BLOCKED_BY_CLASSIFICATION]: 'blockedByClassification',
	[StopKind.HUMAN_REQUESTED]: 'humanRequested',
	[StopKind.APPROVAL_NEEDED]: 'approvalNeeded',
	[StopKind.AUTH_REQUIRED]: 'authRequired',
}

/**
 * C24 RaiseStop — records a Stop for the Needs-You panel, but ONLY when the criterion is enabled in
 * StopPolicyConfig (`STOP_CRITERION_DISABLED` otherwise). Driven by the terminal's stop fact via
 * `RecordStopFromExecution`; that handler swallows the disabled/archived cases as a no-op.
 *
 * ### Why this lives in `thread/` since B4
 * The Stop is a child of the `Thread` aggregate (spec decision 4), so this use case loads a `Thread`,
 * calls a method on it and saves it. `docs/BACKEND.md:170` forbids importing another context's entities
 * and `:173` restricts changing another context's state to integration events — a version of this use
 * case sitting in `issue/` would break both. It reads `IssueRepository` for the archived guard, which is
 * the sanctioned cross-context shape (a repository READ, `docs/BACKEND.md:412`).
 *
 * ### `ownerId` comes from the THREAD
 * It used to come from `issue.ownerId`, which is exactly what made a stop without an issue impossible to
 * scope. The thread always exists and always knows its owner.
 */
@injectable()
export class RaiseStop extends Handler<typeof RaiseStopInputSchema, typeof RaiseStopOutputSchema> {
	readonly name = 'raise_stop' as const
	readonly inputSchema = RaiseStopInputSchema
	readonly outputSchema = RaiseStopOutputSchema

	constructor(
		private readonly threads: ThreadRepository,
		private readonly issues: IssueRepository,
		private readonly policy: StopPolicyConfigRepository,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		// IDEMPOTENT, and it is a NAMED tightening (see the Scope fence). `stopId` is decided upstream and
		// the fact that drives this is at-least-once, so a redelivery arrives with the SAME id — which used
		// to hit the primary key of `issue_stops` and THROW. The handler above only swallows three named
		// codes, so the outbox retried a constraint violation five times and dead-lettered the needs-you
		// signal: the operator never saw the card. Early return is the shape `OpenIssue` already uses for
		// exactly this ("returns early when it already exists"), and it is what makes the docstring's
		// promise — the sanctioned outcomes are a no-op, "not surfaced" — actually true.
		const existing = await this.threads.findStop(input.stopId)
		if (existing) return { stopId: existing.stopId }

		const thread = await this.threads.findById(input.threadId)
		if (!thread) throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${input.threadId}`)

		// The archived guard applies only when there IS an issue. A thread-level stop has no issue to be
		// archived, and demanding one back would re-close the hole decision 4 opens.
		if (input.issueId) {
			const issue = await this.issues.findById(input.issueId)
			if (!issue) throw new BaseError<ApplicationErrors>('ISSUE_NOT_FOUND', `no issue ${input.issueId}`)
			if (issue.archived) throw new BaseError<ApplicationErrors>('ISSUE_ARCHIVED', `issue ${input.issueId} is archived`)
		}

		const policy = await this.policy.get(thread.ownerId)
		if (!policy[POLICY_KEY[input.kind]]) {
			throw new BaseError<ApplicationErrors>('STOP_CRITERION_DISABLED', `the ${input.kind} criterion is disabled`)
		}

		return this.withTransaction(tx, async tx => {
			const stop = thread.raiseStop({
				stopId: input.stopId,
				issueId: input.issueId,
				kind: input.kind,
				title: input.title,
				detail: input.detail,
			})
			await this.threads.save(thread, tx)
			return { stopId: stop.stopId }
		})
	}
}
```

- [ ] `ISSUE_ARCHIVED` deixa de ser levantado por `issue.assertNotArchived()` (método de entidade de outro contexto) e passa a ser um ApplicationError deste use case sobre a flag lida — a leitura de agregado alheio é sancionada, chamar método de domínio dele não é. Registrar `ISSUE_ARCHIVED` + `ISSUE_NOT_FOUND` em `thread/errors` com o MESMO status do contexto `issue` (422 / 404), como o arquivo já faz para `WORKSPACE_NOT_FOUND`/`PROVIDER_NOT_DETECTED`.

### Step T6.2 — Proposed file: Modify (após `git mv`) `packages/api/typescript/src/thread/usecases/ResolveStop.ts`

```bash
git mv packages/api/typescript/src/issue/usecases/ResolveStop.ts packages/api/typescript/src/thread/usecases/ResolveStop.ts
```

COMPLETE final file:

```typescript
import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { StopResolution } from '@codedm/contracts-typescript/wire/enums'
import { ThreadRepository } from '../repositories/ThreadRepository'
import type { ApplicationErrors } from '../errors'

export const ResolveStopInputSchema = z.object({ ownerId: z.uuid(), stopId: z.uuid(), resolution: z.enum(StopResolution) })
export const ResolveStopOutputSchema = z.void()

/**
 * C25 ResolveStop — the operator answers a stop.
 *
 * Orchestration only, which is the point of the change: the three rules that decide whether a
 * resolution is legal (the stop belongs to this thread, it is still open, the resolution applies to the
 * kind) are invariants of `Thread.resolveStop` now. This use case looks the stop up, checks tenancy,
 * hands both to the aggregate, and commits the write together with the fact the aggregate raised.
 * `RESOLUTION_NOT_APPLICABLE` used to be thrown HERE against a table imported from `issue/objects`.
 *
 * `thread.stop_resolved` → `integration.thread.stop_resolved` is bridged by
 * `PublishThreadIntegrationEvents`; TAKE_OVER additionally pauses the thread on the consuming side.
 */
@injectable()
export class ResolveStop extends Handler<typeof ResolveStopInputSchema, typeof ResolveStopOutputSchema> {
	readonly name = 'resolve_stop' as const
	readonly inputSchema = ResolveStopInputSchema
	readonly outputSchema = ResolveStopOutputSchema

	constructor(private readonly threads: ThreadRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		const stop = await this.threads.findStop(input.stopId)
		if (!stop || stop.ownerId !== input.ownerId) throw new BaseError<ApplicationErrors>('STOP_NOT_FOUND', `no stop ${input.stopId}`)

		const thread = await this.threads.findById(stop.threadId)
		if (!thread) throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${stop.threadId}`)

		await this.withTransaction(tx, async tx => {
			thread.resolveStop(stop, input.resolution)
			await this.threads.save(thread, tx)
			// The aggregate raised the fact; the use case owns the transaction, so the drain happens here —
			// unlike Go, where the repository pulls. First TS call site of a mechanism `BaseEntity` has
			// always had.
			await this.domainEventRepository.saveMany(thread.pullDomainEvents(), tx)
		})
	}
}
```

### Step T6.3 — Mover `UpdateStopCriteriaConfig` e `GetNeedsYouPanel`, e corrigir o join (AC-9)

```bash
git mv packages/api/typescript/src/issue/usecases/UpdateStopCriteriaConfig.ts packages/api/typescript/src/thread/usecases/UpdateStopCriteriaConfig.ts
git mv packages/api/typescript/src/issue/usecases/GetNeedsYouPanel.ts packages/api/typescript/src/thread/usecases/GetNeedsYouPanel.ts
```

- [ ] `UpdateStopCriteriaConfig.ts`: só o import da policy muda (`../repositories/StopPolicyConfigRepository`). Acompanha o repositório porque é o WRITER da settings row que agora pertence a `thread`.

Proposed file: Modify `packages/api/typescript/src/thread/usecases/GetNeedsYouPanel.ts` — COMPLETE final file:

```typescript
import { injectable } from 'tsyringe-neo'
import { and, eq, isNull } from 'drizzle-orm'
import { Handler, z, DrizzleClient } from '@codedm/core-typescript'
import { stops, issues } from '@codedm/contracts/db'
import { StopKind, StopResolution } from '@codedm/contracts-typescript/wire/enums'
import { resolutionsForKind } from '../objects/StopResolutions'

export const GetNeedsYouPanelInputSchema = z.object({ ownerId: z.uuid(), threadId: z.uuid() })
export const GetNeedsYouPanelOutputSchema = z.object({
	stops: z.array(
		z.object({
			stopId: z.uuid(),
			/**
			 * OPTIONAL since B4 (AC-9). A thread-level stop has no issue, and a required key here would
			 * have kept the panel unable to render the very case decision 4 exists to enable.
			 */
			issueId: z.uuid().optional(),
			issueKey: z.string().optional(),
			kind: z.enum(StopKind),
			title: z.string(),
			detail: z.string(),
			raisedAt: z.string(),
			availableResolutions: z.array(z.enum(StopResolution)),
		}),
	),
})

/**
 * Read — NeedsYouPanel (T14). Every open stop on a thread with its per-kind resolution actions.
 * Multiple simultaneous stops per thread are ALL listed (the modeling's hot spot).
 *
 * ### `leftJoin`, not `innerJoin` (B4, AC-9)
 * With `issue_id` nullable, the `innerJoin` this had would SILENTLY DISCARD every stop without an issue
 * — the exact inverse of what decision 4 enables. The panel is the surface where a thread-level
 * needs-approval has to appear; a join that drops it turns the feature into a no-op nobody sees fail.
 *
 * Lives in `thread/` since B4: its output IS stops, and stops belong to this aggregate. The HTTP path
 * (`/threads/:threadId/needs-you`) is unchanged — controllers own their paths and the mount is uniform.
 */
@injectable()
export class GetNeedsYouPanel extends Handler<typeof GetNeedsYouPanelInputSchema, typeof GetNeedsYouPanelOutputSchema> {
	readonly name = 'get_needs_you_panel' as const
	readonly inputSchema = GetNeedsYouPanelInputSchema
	readonly outputSchema = GetNeedsYouPanelOutputSchema

	constructor(private readonly db: DrizzleClient) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const rows = await this.db
			.select({
				stopId: stops.id,
				issueId: stops.issueId,
				issueKey: issues.key,
				kind: stops.kind,
				title: stops.title,
				detail: stops.detail,
				raisedAt: stops.raisedAt,
			})
			.from(stops)
			.leftJoin(issues, eq(stops.issueId, issues.id))
			// TENANCY, and it is a NAMED tightening (see the Scope fence): `ownerId` was already on the
			// input and already passed by the controller from `ctx`, and it was already unused — so any
			// caller who knew a thread id could read another owner's stops. The sibling read guards
			// (`GetSessionChat` throws THREAD_NOT_FOUND on an owner mismatch); this one silently did not.
			// One predicate, in a file this Task rewrites anyway, over an indexed column that exists.
			.where(and(eq(stops.ownerId, input.ownerId), eq(stops.threadId, input.threadId), isNull(stops.resolvedAt)))

		return {
			stops: rows.map(r => ({
				stopId: r.stopId,
				issueId: r.issueId ?? undefined,
				issueKey: r.issueKey ?? undefined,
				// No cast: `issue_stops.kind` carries `$type<StopKind>()`, and a `leftJoin` widens only the
				// RIGHT side (`issues.key`), so the left columns keep their declared types.
				kind: r.kind,
				title: r.title,
				detail: r.detail,
				raisedAt: r.raisedAt.toISOString(),
				availableResolutions: resolutionsForKind(r.kind),
			})),
		}
	}
}
```

### Step T6.4 — Mover os três controllers

```bash
git mv packages/api/typescript/src/issue/controllers/ResolveStop.ts packages/api/typescript/src/thread/controllers/ResolveStop.ts
git mv packages/api/typescript/src/issue/controllers/UpdateStopCriteria.ts packages/api/typescript/src/thread/controllers/UpdateStopCriteria.ts
git mv packages/api/typescript/src/issue/controllers/GetNeedsYouPanel.ts packages/api/typescript/src/thread/controllers/GetNeedsYouPanel.ts
```

Nenhum dos três muda de conteúdo além do caminho relativo do import do use case (`../usecases/...` continua resolvendo, agora dentro de `thread/`). **Os três `readonly path` permanecem byte-idênticos** — `/stops/:stopId/resolve`, `/settings/stop-criteria`, `/threads/:threadId/needs-you` — porque o mount é uniforme e o controller possui o path (`core/src/types/BoundedContext.ts:25-30`). A única mudança visível a jusante é a TAG OpenAPI (`issue` → `thread`), que reordena identificadores gerados sem renomear nenhum export consumido pelo front.

- [ ] `issue/controllers/index.ts`: remover os três exports
- [ ] `thread/controllers/index.ts`: acrescentar os três
- [ ] `issue/usecases/index.ts` / `thread/usecases/index.ts`: mover os quatro exports
- [ ] Conferir que `ResolveStopController` continua com `override middlewares = [OperatorMiddleware]` (importado de `@auth/middlewares`, cross-context sancionado)

### Step T6.5 — Scaffold + Proposed file: Create `packages/api/typescript/src/thread/handlers/RecordStopFromExecution.ts`

```bash
bun cli handler thread RecordStopFromExecution --external --print
```

O gerador emite `<Pascal>Handler.ts`; a convenção viva do repo é sem sufixo (`MaterializeIssueFromExecution.ts`, `PublishThreadIntegrationEvents.ts`) — usar `--print` para o corpo canônico e escrever no caminho da convenção. **Lacuna de CLI registrada** (regra da casa "if you wrote it, the CLI should write it"): o gerador de `handler` acrescenta um sufixo `Handler` que nenhum handler do repo usa → follow-up.

COMPLETE file:

```typescript
import { injectable } from 'tsyringe-neo'
import { BaseError, EventHandler } from '@codedm/core-typescript'
import { IssueStopRaisedEvent } from '@codedm/contracts-typescript/wire/events'
import { StopKind } from '@codedm/contracts-typescript/wire/enums'
import { Id } from '@codedm/core-typescript'
import { RaiseStop } from '../usecases/RaiseStop'

const STOP_TITLES: Record<StopKind, string> = {
	[StopKind.SERVER_ERROR]: 'Server error — the agent hit an API limit or outage',
	[StopKind.BLOCKED_BY_CLASSIFICATION]: 'Reply blocked by classification',
	[StopKind.HUMAN_REQUESTED]: 'A participant asked for a human',
	[StopKind.APPROVAL_NEEDED]: 'An action needs your approval',
	[StopKind.AUTH_REQUIRED]: 'The agent CLI needs you to sign in again',
}

/**
 * The stop fact from the terminal engine → a Stop on the thread it belongs to.
 *
 * This branch used to live in `issue/handlers/MaterializeIssueFromExecution`, alongside the three ISSUE
 * facts. It moved with the aggregate (B4, spec decision 4): the consuming context is the one that owns
 * the state the fact changes, and stops are `Thread`'s children now. `MaterializeIssueFromExecution`
 * keeps `opened` / `created` / `completed`, which really are issue facts.
 *
 * `threadId` comes off the payload — the fact has always carried it (that is how `BrowserFrameEnricher`
 * resolves the frame) — so a stop with no `issueId` routes exactly as well as one with.
 */
@injectable()
export class RecordStopFromExecution extends EventHandler<typeof IssueStopRaisedEvent> {
	readonly event = IssueStopRaisedEvent

	constructor(private readonly raiseStop: RaiseStop) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		try {
			// `detail` is the agent's OWN words, additive on the frozen event since Fase 6 (§4.4 item (i)) —
			// before it existed this was hardcoded `''` and every Needs-you card rendered the generic
			// `STOP_TITLES` line with no body.
			//
			// HUMAN_REQUESTED is the one kind whose title is the text: it is what `AskOperator` raises, and
			// the operator needs to read the QUESTION on the card, not "A participant asked for a human".
			// The other four keep the generic title, which describes a condition rather than a sentence
			// somebody wrote. Empty `detail` falls back so a producer that carries no text still renders
			// something.
			const detail = event.payload.detail
			const title =
				event.payload.kind === StopKind.HUMAN_REQUESTED && detail.length > 0
					? detail
					: (STOP_TITLES[event.payload.kind] ?? 'The agent needs you')
			await this.raiseStop.execute({
				stopId: event.payload.stopId || Id.value(),
				threadId: event.payload.threadId,
				issueId: event.payload.issueId || undefined,
				kind: event.payload.kind,
				title,
				detail,
			})
		} catch (error) {
			// ONLY the sanctioned no-op outcomes are swallowed (the stop is simply not recorded). Anything
			// else — a DB outage included — must rethrow so the outbox retries instead of silently eating
			// the needs-you signal.
			const swallowed: readonly string[] = ['STOP_CRITERION_DISABLED', 'ISSUE_ARCHIVED', 'ISSUE_NOT_FOUND', 'THREAD_NOT_FOUND']
			if (error instanceof BaseError && swallowed.includes(error.name)) return
			throw error
		}
	}
}
```

- [ ] `THREAD_NOT_FOUND` entra na lista de swallow: uma thread apagada não tem onde receber o stop, e um throw faria o outbox retentar cinco vezes e dead-letter — a mesma postura defensiva que `RecordOrchestratorReply` já toma para o mesmo caso
- [ ] `packages/api/typescript/src/thread/handlers/external.ts`: acrescentar `export { RecordStopFromExecution } from './RecordStopFromExecution'`

### Step T6.6 — Proposed file: Modify `packages/api/typescript/src/issue/handlers/MaterializeIssueFromExecution.ts`

Sai `IssueStopRaisedEvent` da tupla e do `event`, sai `STOP_TITLES`, sai o bloco `if (event instanceof IssueStopRaisedEvent)` inteiro (com o try/catch), saem os imports de `StopKind`, `Id`, `RaiseStop` e `BaseError`. O docblock passa a:

```typescript
/**
 * BC5's read-side materialization from the terminal engine's EXECUTION facts (the engine owns these
 * frozen integration events; BC5 reacts to keep its Issue aggregate in sync):
 *   integration.issue.opened     → OpenIssue (materialize the aggregate, idempotent)
 *   integration.issue.created    → OpenIssue (same idempotent path — §6.2 reconciles both on one row)
 *   integration.issue.completed  → CompleteIssue (stamp COMPLETED + start the 24h clock)
 *
 * The stop fact left with the aggregate that owns it (B4, spec decision 4) — it is handled by
 * `thread/handlers/RecordStopFromExecution` now, and the swallow list for the disabled-criterion /
 * archived-issue cases went with it.
 */
```

E a assinatura:

```typescript
export class MaterializeIssueFromExecution extends EventHandler<
	readonly [typeof IssueOpenedEvent, typeof IssueCreatedEvent, typeof IssueCompletedEvent]
> {
	readonly event = [IssueOpenedEvent, IssueCreatedEvent, IssueCompletedEvent] as const

	constructor(
		private readonly openIssue: OpenIssue,
		private readonly completeIssue: CompleteIssue,
	) {
		super()
	}
```

### Step T6.7 — Os dois publishers trocam de fato

Proposed file: Modify `packages/api/typescript/src/issue/handlers/PublishIssueIntegrationEvents.ts` — COMPLETE final file:

```typescript
import { injectable } from 'tsyringe-neo'
import { EventHandler, ExternalMediator } from '@codedm/core-typescript'
import { IssueArchivedEvent as IssueArchivedIntegrationEvent } from '@codedm/contracts-typescript/wire/events'
import { IssueArchivedEvent } from '../events'

/**
 * Write-side bridge (EVT-02/03): BC5's control-plane facts → frozen integration events.
 *   issue.archived → integration.issue.archived (BC4 issue-list projections)
 *
 * `issue.stop_resolved` left in B4 (spec decision 4): the Stop is a child of `Thread`, the fact is
 * raised by `Thread.resolveStop`, and it is bridged by `PublishThreadIntegrationEvents`. The
 * subscription stays a readonly TUPLE with one member — this is the context's publisher, one per
 * CONTEXT by design, and collapsing it to a bare class would have to be undone by the next fact.
 */
@injectable()
export class PublishIssueIntegrationEvents extends EventHandler<readonly [typeof IssueArchivedEvent]> {
	readonly event = [IssueArchivedEvent] as const

	constructor(private readonly mediator: ExternalMediator) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const ownerId = event.ownerId ?? ''

		await this.mediator.publish(
			new IssueArchivedIntegrationEvent({
				ownerId,
				payload: { issueId: event.payload.issueId, threadId: event.payload.threadId, reason: event.payload.reason },
			}),
		)
	}
}
```

Proposed file: Modify `packages/api/typescript/src/thread/handlers/PublishThreadIntegrationEvents.ts` — COMPLETE final file:

```typescript
import { injectable } from 'tsyringe-neo'
import { EventHandler, ExternalMediator } from '@codedm/core-typescript'
import {
	ThreadAttachedEvent as ThreadAttachedIntegrationEvent,
	IssueStopResolvedEvent as StopResolvedIntegrationEvent,
} from '@codedm/contracts-typescript/wire/events'
import { ThreadAttachedEvent } from '../events/ThreadAttachedEvent'
import { ThreadStopResolvedEvent } from '../events/ThreadStopResolvedEvent'

/**
 * The thread context's NAMED EXCEPTION (B3, decision 4): the ONE handler in this context authorized to
 * call `ExternalMediator.publish()`. Every other handler here is pure domain — it reacts and invokes
 * use cases, and never publishes integration events. Facts republished as their FROZEN contracts:
 *   thread.attached      → integration.thread.attached      (frozen fact; no TS consumer today — the
 *                                                            browser SSE surface forwards it)
 *   thread.stop_resolved → integration.issue.stop_resolved   (TAKE_OVER additionally pauses the thread)
 *
 * The stop branch arrived in B4 with the aggregate: `Thread.resolveStop` raises the fact, so this
 * context's publisher bridges it — it was `PublishIssueIntegrationEvents` while the Stop hung off
 * `Issue`. The integration NAME is still `integration.issue.stop_resolved` at this commit; T7 renames
 * the contract and this alias with it.
 *
 * The `thread.direct_message_sent` branch is GONE (B3, decision 3): it translated a fact into
 * `integration.channel.delivery_requested`, i.e. it used an event to COMMAND. The order is now a
 * durable `deliver_channel_message` command enqueued inside `SendDirectMessage`'s own transaction, and
 * the fact stays as an audit record with no consumer.
 */
@injectable()
export class PublishThreadIntegrationEvents extends EventHandler<readonly [typeof ThreadAttachedEvent, typeof ThreadStopResolvedEvent]> {
	readonly event = [ThreadAttachedEvent, ThreadStopResolvedEvent] as const

	constructor(private readonly mediator: ExternalMediator) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const ownerId = event.ownerId ?? ''

		if (event instanceof ThreadAttachedEvent) {
			await this.mediator.publish(new ThreadAttachedIntegrationEvent({ ownerId, payload: { ...event.payload } }))
			return
		}

		await this.mediator.publish(
			new StopResolvedIntegrationEvent({
				ownerId,
				// `issueId` is still REQUIRED on the frozen contract at this commit — T7 makes it optional and
				// adds `threadId`. Until then a thread-level stop bridges with an empty string rather than
				// failing the schema; no such stop can exist yet (nothing calls `raiseStop` without an issue
				// before T7 lands the optional key upstream).
				payload: { stopId: event.payload.stopId, issueId: event.payload.issueId ?? '', resolution: event.payload.resolution },
			}),
		)
	}
}
```

- [ ] `packages/api/typescript/src/issue/events/index.ts`: remover `export * from './IssueStopResolvedEvent'` e ajustar o comentário do topo
- [ ] `git rm packages/api/typescript/src/issue/events/IssueStopResolvedEvent.ts`
- [ ] `packages/api/typescript/src/thread/handlers/internal.ts`: conferir que `PublishThreadIntegrationEvents` já está exportado (é o publisher do contexto desde o B3) — nada muda

### Step T6.8 — Matar `StopRepository` e mover os error codes

- [ ] `git rm -r packages/api/typescript/src/issue/repositories/StopRepository`
- [ ] `issue/registry.ts`: remover o import (linha 6) e o binding (linha 16)
- [ ] `issue/repositories/index.ts`: remover a linha 2
- [ ] `issue/errors/index.ts`: remover `STOP_NOT_FOUND`, `STOP_CRITERION_DISABLED`, `RESOLUTION_NOT_APPLICABLE` da união e do `registerErrorCodes` (o contexto `issue` não levanta nenhum dos três depois desta Task)
- [ ] `thread/errors/index.ts`: acrescentar `STOP_NOT_FOUND` (404), `STOP_CRITERION_DISABLED` (422), `ISSUE_NOT_FOUND` (404) e `ISSUE_ARCHIVED` (422) — os dois últimos re-registrados com o MESMO status do contexto dono, exatamente como o arquivo já faz para `WORKSPACE_NOT_FOUND`/`PROVIDER_NOT_DETECTED`/`GATEWAY_UNAVAILABLE` (`registerErrorCodes` é `Object.assign`, sobrescrita idempotente)
- [ ] `shared/context-map.ts`: o par `thread↔issue` ganha a nota do read de `IssueRepository` por `RaiseStop` (guarda de arquivada) e perde o que dizia respeito a stop no sentido inverso

### Step T6.9 — Migrar os testes de stop

- [ ] `tests/support/given/stops.ts` — o helper passa pelo agregado (mantendo a regra de nunca usar o use case). COMPLETE final file:

```typescript
// Stop given helper — raises a Stop through the THREAD AGGREGATE + its repository (never the RaiseStop
// use case), so a test about resolution/panels never depends on the raise pipeline being correct.
//
// Since B4 the Stop is a child of `Thread` (spec decision 4), so the helper needs a thread: it nests
// `givenThread` when the caller passes none, which is the documented shape for exactly this.
import type { TestBed } from '../TestBed'
import { StopKind } from '@codedm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import type { Stop } from '@thread/entities/Thread'
import { givenThread } from './threads'

type StopOverrides = Partial<{
	stopId: string
	ownerId: string
	/** Left undefined on purpose by the tests that exercise a THREAD-LEVEL stop (B4, US-5). */
	issueId: string
	threadId: string
	kind: StopKind
	title: string
	detail: string
}>

export async function givenStop(testBed: TestBed, overrides: StopOverrides = {}): Promise<Stop> {
	const repo = testBed.resolve(ThreadRepository)
	const ownerId = overrides.ownerId ?? OPERATOR_ID
	const thread = overrides.threadId
		? (await repo.findById(overrides.threadId))!
		: await givenThread(testBed, { ownerId })

	const stop = thread.raiseStop({
		stopId: overrides.stopId,
		issueId: overrides.issueId,
		kind: overrides.kind ?? StopKind.HUMAN_REQUESTED,
		title: overrides.title ?? 'The agent needs you',
		detail: overrides.detail ?? '',
	})
	await repo.save(thread)
	return stop
}
```

- [ ] `src/issue/usecases/IssueLifecycle.test.ts:14,51` — `testBed.resolve(StopRepository)` → `testBed.resolve(ThreadRepository)`, `openByIssue(id)` → `openStopsByIssue(id)`
- [ ] `tests/flows/stop-control-plane.flow.test.ts:12,13,64,89,105` — imports de `@issue/repositories/*` → `@thread/repositories/*`; `StopRepository` → `ThreadRepository`; `openByIssue` → `openStopsByIssue`; o `wireBridges` do flow passa a registrar `PublishThreadIntegrationEvents` para o `stop_resolved` (era `PublishIssueIntegrationEvents`) e o consumidor do fato de raise passa a ser `RecordStopFromExecution`. As duas assertivas de `getPublishedOfType('integration.issue.stop_resolved')` (`:81`, `:106`) ficam com o nome ANTIGO nesta Task — T7 as renomeia.
- [ ] `tests/kernel/insert-site-audit.test.ts:123-127` — o caso muda de nome e de caminho:

```typescript
	it('issue_stops — via ThreadRepository (a Stop is a child of the Thread aggregate)', async () => {
		await givenStop(testBed, { ownerId: OWNER })
		await assertLanded('issue_stops', ['id', 'raised_at'])
	})
```

### Step T6.10 — Verde, greps e Contract-free check

- [ ] `cd packages/api/typescript && bun test` → 0 fail
- [ ] `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` → exit 0
- [ ] `bun lint` → exit 0
- [ ] `grep -rn "StopRepository" packages/api/typescript | grep -v StopPolicyConfigRepository` → **vazio** (AC-8)
- [ ] `grep -rn "@issue/repositories/StopPolicyConfigRepository\|issue/repositories/StopPolicyConfigRepository" packages/api/typescript` → **vazio** (AC-16)
- [ ] `grep -rn "from '@thread/entities'\|from '@thread/events'" packages/api/typescript/src/issue` → **vazio** (nenhum import cross-context de entidade/evento sobrou em `issue/`)
- [ ] `bun emit-openapi && git diff --stat packages/api/typescript/public/docs/openapi.json` → confirmar que os três paths continuam presentes e que a única mudança é a tag + o schema de `GetNeedsYouPanel` (campos opcionais)

### Step T6.11 — Commit

```bash
git add packages/api/typescript/src packages/api/typescript/tests
git commit -m "refactor(thread,issue): B4 — o control-plane de stop muda para o contexto dono

RaiseStop, ResolveStop, UpdateStopCriteriaConfig e GetNeedsYouPanel (+ os 3
controllers, os error codes e o domain event) atravessam de issue/ para thread/,
porque desde a spec decisao 4 quem muta a Stop muta o agregado Thread — e
docs/BACKEND.md:170/173 proibe importar entidade de outro contexto e mudar o
estado dele fora de integration event. Nenhum path HTTP muda (o mount e uniforme
e o controller possui o path); muda a tag OpenAPI.

A branch de stop_raised sai de MaterializeIssueFromExecution e vira
thread/handlers/RecordStopFromExecution. thread.stop_resolved passa a ser
bridgeado por PublishThreadIntegrationEvents. StopRepository morre (AC-8);
GetNeedsYouPanel troca innerJoin por leftJoin e torna issueId/issueKey opcionais,
senao um stop sem issue seria descartado em silencio (AC-9)."
```

---

## Task T7: Contract Lock — `thread-stop-raised.tsp` / `thread-stop-resolved.tsp`

**Files to write:**
- Move: `packages/contracts/wire/events/issue-stop-raised.tsp` → `packages/contracts/wire/events/thread-stop-raised.tsp`
- Move: `packages/contracts/wire/events/issue-stop-resolved.tsp` → `packages/contracts/wire/events/thread-stop-resolved.tsp`
- Modify: `packages/contracts/wire/events/index.tsp` — as duas linhas de `import`
- Regen: `packages/contracts/generated/typescript/src/wire/events/`
- Regen: `packages/contracts/generated/go/wire/`
- Regen: `packages/api/typescript/public/docs/openapi.json`
- Regen: `packages/client/dist/typescript/src/typescript/`
- Modify: `packages/api/typescript/src/agent/handlers/PublishAgentIntegrationEvents.ts`
- Modify: `packages/api/typescript/src/agent/handlers/PublishAgentIntegrationEvents.test.ts`
- Modify: `packages/api/typescript/src/thread/handlers/RecordStopFromExecution.ts`
- Modify: `packages/api/typescript/src/thread/handlers/PublishThreadIntegrationEvents.ts`
- Modify: `packages/api/typescript/src/ui/services/BrowserFrameEnricher/BrowserFrameEnricher.ts`
- Modify: `packages/api/typescript/src/ui/services/BrowserFrameEnricher/BrowserFrameEnricher.test.ts`
- Modify: `packages/api/typescript/src/ui/controllers/ListenEvents.test.ts`
- Modify: `packages/api/typescript/src/agent/events/AgentRunStopRaisedEvent.ts`
- Modify: `packages/api/typescript/src/agent/enums/FactSource.ts`
- Modify: `packages/api/typescript/src/agent/usecases/AskOperator.ts`
- Modify: `packages/api/typescript/src/agent/usecases/AskOperator.test.ts`
- Modify: `packages/api/typescript/tests/flows/stop-control-plane.flow.test.ts`
- Modify: `packages/e2e/tests/08-stop-resolve.spec.ts`

**Files to read:**
- `packages/contracts/wire/events/_base.tsp` — o envelope (`@discriminator("name")`, `entityId`, `ownerId`, `occurredAt`)
- `packages/contracts/wire/events/index.tsp` — o barrel de imports (não há glob; cada `.tsp` é listado à mão)
- `git show 56bec8bc --stat` — o conjunto EXATO de 12 arquivos que uma mudança de contrato de integration event toca (2 à mão, 10 regenerados). É o molde deste Contract Lock.

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /event, /sdk
**Depends on:** T6
**Consumes (frozen):** de T6, verbatim — `RecordStopFromExecution` (que hoje importa `IssueStopRaisedEvent`), o alias `StopResolvedIntegrationEvent` em `PublishThreadIntegrationEvents`, e o fato de que `MaterializeIssueFromExecution` já NÃO subscreve o stop. De T5, verbatim — `ThreadStopResolvedEvent` (DOMAIN event, `thread.stop_resolved`), cujo nome de classe COLIDE com o do integration event gerado; todo import do integration event usa alias, como `PublishIssueIntegrationEvents` já fazia.
**Scope fence:** DONE: o rename dos dois contratos, `issueId` opcional nos dois, `threadId` em `stop_resolved`, o regen completo e o re-aponte dos consumidores TS. OUT: o front (T8 — Task própria, gate próprio); a remoção dos frames `browser.*` (é do B5 — aqui o enricher só troca os NOMES dos `case`); e relaxar `AskOperatorInputSchema.issueId` / `AgentRunStopRaisedEventSchema.issueId`, que é do B2 (a spec ordena B4 antes de B2 exatamente para isso). Nenhuma edição Go à mão: `grep -rn "IssueStopRaised\|IssueStopResolved" packages/api/go/` fora de `core/db` é vazio.
**Gate:** `bun contracts && bun emit-openapi && bun sdk && bun check:generated && cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit && bun test` — exit 0 em todos, e `grep -rn "integration.issue.stop" packages/api packages/contracts packages/client packages/e2e` retorna vazio (AC-15)

### Step T7.1 — Proposed file: Create `packages/contracts/wire/events/thread-stop-raised.tsp`

```bash
git mv packages/contracts/wire/events/issue-stop-raised.tsp packages/contracts/wire/events/thread-stop-raised.tsp
git mv packages/contracts/wire/events/issue-stop-resolved.tsp packages/contracts/wire/events/thread-stop-resolved.tsp
```

COMPLETE final file `thread-stop-raised.tsp`:

```tsp
import "./_base.tsp";

namespace TemplateContracts;

@doc("BC6 Terminal -> BC4 Thread & Routing. An agent stopped and needs the human; flips the thread to NEEDS_ATTENTION, lights the dock badge and the Home callout. Renamed from integration.issue.stop_raised in B4: the Stop is a child of the THREAD aggregate, and a contract is named after its owner.")
model ThreadStopRaisedEvent extends IntegrationEvent {
  name: "integration.thread.stop_raised";
  stopId: string;

  @doc("OPTIONAL since B4 (aggregate-boundaries spec, decision 4). A thread-level stop — the orchestrator asking for approval before any issue exists — has none, and while this key was required that case was unreachable no matter what the aggregate allowed.")
  issueId?: string;

  threadId: string;
  kind: StopKind;

  @doc("The human-readable reason the agent gave. ADDITIVE field (GOAL-agent-abstraction Fase 6, §4.4 item (i)): without it the text of `RaiseStop(kind, detail)` and the question of `AskOperator(question)` die at the bridge and the Needs-you card is born empty. Empty string when the fact carries no text — required rather than optional so no producer can omit it silently.")
  detail: string;
}
```

COMPLETE final file `thread-stop-resolved.tsp`:

```tsp
import "./_base.tsp";

namespace TemplateContracts;

@doc("BC4 Thread & Routing -> consumers. A stop was resolved by the operator. TAKE_OVER additionally pauses the thread. Renamed from integration.issue.stop_resolved in B4 along with its owner; the payload gained `threadId` (which stop_raised always carried) so a consumer no longer has to look up issue -> thread to know which conversation changed, and `issueId` became optional because a thread-level stop has none.")
model ThreadStopResolvedEvent extends IntegrationEvent {
  name: "integration.thread.stop_resolved";
  stopId: string;
  issueId?: string;
  threadId: string;
  resolution: StopResolution;
}
```

- [ ] `packages/contracts/wire/events/index.tsp`: as duas linhas `import "./issue-stop-raised.tsp";` / `import "./issue-stop-resolved.tsp";` viram `import "./thread-stop-raised.tsp";` / `import "./thread-stop-resolved.tsp";`. Reposicionar junto de `./thread-attached.tsp` para o barrel continuar agrupado por família.
- [ ] `threadId` em `stop_resolved` NÃO é opcional: é a razão pela qual o front consegue escutar o fato cru sem enriquecimento, e o comentário em `packages/app/react/src/routes/(app)/threads/$threadId/-components/NeedsYouPanel/index.tsx:23-27` (que hoje diz que `stop_resolved` "carries no threadId and so was nobody's frame") passa a estar factualmente errado — corrigido no T8.

### Step T7.2 — Regenerar tudo que descende do contrato

```bash
bun contracts        # tsp:compile + codegen:wire (TS + Go) + drizzle:generate (no-op aqui)
bun emit-openapi     # api-typescript + api-go
bun sdk              # kubb (nx run client:generate)
```

Esperado, pelo molde de `56bec8bc` (12 arquivos, 2 à mão + 10 gerados) — aqui um RENAME, então cada lado aparece como delete+create:

- `packages/contracts/generated/typescript/src/wire/events/thread-stop-raised.ts` + `thread-stop-resolved.ts` (novos), `issue-stop-*.ts` (removidos)
- `generated/typescript/src/wire/events/_imports.ts` (2 linhas), `index.ts` (6 linhas: import member + `export *` + arm da `IntegrationEventSchema`, ×2), `materialized.ts` (8 linhas: import + alias `…MaterializedSchema` + arm de `materializedIntegrationEventSchemas` + arm de `MaterializedIntegrationEventSchema`, ×2) — todos alfabeticamente ordenados, logo `thread-stop-*` muda de posição
- `generated/go/wire/events.go` (2 consts + 4 tipos + 2 métodos `EventName()`), `generated/go/wire/envelope.go` (2 `case` do `UnmarshalIntegrationEvent`)
- `packages/api/typescript/public/docs/openapi.json` (os dois `const` do discriminador, `:7316` e `:7363`)
- `packages/client/dist/typescript/src/typescript/{index.ts, types/ListenEvents.ts, types/BrowserIntegrationEventName.ts, zod/listenEventsSchema.ts, zod/browserIntegrationEventNameSchema.ts}` — `ListenEvents200NameEnum<N>` renumera (a união é ordenada por nome de wire e `thread.stop_*` passa depois de `orchestrator.replied` e `thread.attached`); nada no front importa esses aliases numerados (`grep -rn "ListenEvents200NameEnum" packages/app/react/src` → vazio), então o churn fica contido no arquivo gerado

- [ ] `bun sdk` (kubb) é INCREMENTAL. Se algum arquivo gerado ainda mencionar `integration.issue.stop`, forçar regen limpo antes de seguir
- [ ] `packages/api/go` NÃO precisa de `sqlc generate` nem de edição à mão — só o regen do wire

### Step T7.3 — Re-apontar os consumidores TS

O nome de classe gerado passa a ser `ThreadStopRaisedEvent` / `ThreadStopResolvedEvent`. **`ThreadStopResolvedEvent` colide** com o domain event de `thread/events/` — todo import do integration event usa alias, o padrão que `PublishIssueIntegrationEvents` já usava.

- [ ] `agent/handlers/PublishAgentIntegrationEvents.ts:8,26,128` — `IssueStopRaisedEvent` → `ThreadStopRaisedEvent`; o comentário do mapa vira `agent.run.stop_raised → integration.thread.stop_raised (BC6 → BC4, NEEDS_ATTENTION)`. **A publicação continua aqui** (decisão D-D): o fato é a CAUSA do raise, não o efeito.
- [ ] `agent/handlers/PublishAgentIntegrationEvents.test.ts:7,89,105-107` — a assertiva real `expect(event.name).toBe('integration.issue.stop_raised')` vira `'integration.thread.stop_raised'`
- [ ] `thread/handlers/RecordStopFromExecution.ts` — o import e o `readonly event` passam a `ThreadStopRaisedEvent`; o `issueId: event.payload.issueId || undefined` simplifica para `issueId: event.payload.issueId` (a chave já é opcional na wire). O arquivo **não é criado aqui**: ele nasce no Step T6.5, scaffoldado por `bun cli handler thread RecordStopFromExecution --external --print` — esta Task só troca dois identificadores dentro dele
- [ ] `thread/handlers/PublishThreadIntegrationEvents.ts` — o alias passa a `ThreadStopResolvedEvent as StopResolvedIntegrationEvent`; o payload perde o `?? ''` e ganha `threadId`:

```typescript
		await this.mediator.publish(
			new StopResolvedIntegrationEvent({
				ownerId,
				payload: {
					stopId: event.payload.stopId,
					issueId: event.payload.issueId,
					threadId: event.payload.threadId,
					resolution: event.payload.resolution,
				},
			}),
		)
```

e o docblock passa a `thread.stop_resolved → integration.thread.stop_resolved`, removendo a nota "T7 renames the contract".

- [ ] `ui/services/BrowserFrameEnricher/BrowserFrameEnricher.ts:10,11,74,78,113,138` — só os IDENTIFICADORES dos dois `case` e os comentários do mapa. **Os frames `browser.*` NÃO são tocados** — a remoção deles é do B5. A oportunidade que o `threadId` novo abre (o branch de `stop_resolved` deixaria de precisar de `threadIdForIssue`) é deliberadamente NÃO aproveitada: o arquivo inteiro morre no B5 e otimizá-lo aqui é trabalho descartado.
- [ ] `ui/services/BrowserFrameEnricher/BrowserFrameEnricher.test.ts:7,44` e `ui/controllers/ListenEvents.test.ts:6,21,91` — identificador da classe. `ListenEvents.test.ts:119` (`expect(arms).toContain('browser.stop_raised')`) é frame `browser.*`, **não muda** (B5).
- [ ] Comentários com o nome antigo, todos em prosa: `agent/events/AgentRunStopRaisedEvent.ts:7,14`, `agent/enums/FactSource.ts:15`, `agent/usecases/AskOperator.ts:37`, `agent/usecases/AskOperator.test.ts:17`, `packages/e2e/tests/08-stop-resolve.spec.ts:7` (spec `test.skip`'d — só o comentário)
- [ ] `tests/flows/stop-control-plane.flow.test.ts:7,17,19,22,41,48,81,98,106` — o import do integration event de raise, os nomes de `describe`/`it`, e as DUAS assertivas reais `getPublishedOfType('integration.issue.stop_resolved')` → `'integration.thread.stop_resolved'`
- [ ] Acrescentar ao flow um caso novo que fecha US-5/AC-7 ponta a ponta: um `ThreadStopRaisedEvent` **sem `issueId`** materializa um stop de nível-thread, e resolvê-lo publica `integration.thread.stop_resolved` com `threadId` e sem `issueId`

### Step T7.4 — Verificar o lock (árvore limpa exigida)

- [ ] `bun check:generated` → exit 0 (re-roda `tsp:compile && codegen:wire` + `bun sdk` e falha em qualquer sujeira de `git status --porcelain` sob `contracts/generated/{ts,go}`, `client/dist/src` e o `openapi.json` do daemon)
- [ ] `grep -rn "integration.issue.stop" packages/api packages/contracts packages/client packages/e2e` → **vazio** (AC-15)
- [ ] `grep -rn "IssueStopRaisedEvent\|IssueStopResolvedEvent" packages/api packages/contracts packages/client` → **vazio**
- [ ] `cd packages/api/go && go build ./... && go test ./...` → ok (só o wire gerado mudou)
- [ ] `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit && bun test` → exit 0 / 0 fail
- [ ] `cd packages/app/react && bun x tsc --noEmit` → **FALHA ESPERADA AQUI**, no `satisfies readonly ServerEventName[]` de `useThreadRealtime.ts:34`, porque a tupla ainda lista `'integration.issue.stop_raised'`. É o tripwire de compilação que o T8 fecha; registrar a saída e seguir.

### Step T7.5 — Commit (antes do T8, que exige árvore limpa para o gate do front)

```bash
git add packages/contracts/wire packages/contracts/generated \
        packages/api/typescript/public/docs/openapi.json \
        packages/client/dist \
        packages/api/typescript/src packages/api/typescript/tests \
        packages/e2e/tests/08-stop-resolve.spec.ts
git commit -m "chore(contracts): B4 — os contratos de stop renomeiam junto com o dono

issue-stop-raised.tsp / issue-stop-resolved.tsp viram thread-stop-raised.tsp /
thread-stop-resolved.tsp (integration.thread.stop_raised / .stop_resolved).
issueId fica OPCIONAL nos dois — e essa unica letra e o que torna alcancavel o
stop de nivel-thread. stop_resolved ganha threadId, que stop_raised sempre
carregou: um consumidor deixa de precisar resolver issue -> thread para saber
qual conversa mudou.

Regenerados wire TS/Go, o openapi.json do daemon e o SDK. Zero edicao Go a mao
(o grep por IssueStopRaised/Resolved fora de core/db era vazio). O front fica
vermelho de proposito neste commit: o satisfies de ServerEventName e o tripwire
que o proximo fecha."
```

---

## Task T8: re-aponte mínimo do front — só os nomes

**Files to write:**
- Modify: `packages/app/react/src/routes/(app)/threads/$threadId/-hooks/useThreadRealtime.ts`
- Modify: `packages/app/react/src/routes/(app)/threads/$threadId/-hooks/useThreadRealtime.test.tsx`
- Modify: `packages/app/react/src/routes/(app)/threads/$threadId/-components/NeedsYouPanel/index.tsx`

**Files to read:**
- `packages/app/react/src/hooks/useServerEvents.ts:8` — `ServerEventName = ListenEventsQueryResponse['name']`, ou seja a superfície inteira vem do SDK gerado; é o que faz o nome velho virar erro de compilação
- `packages/app/react/tsconfig.json` — `include: ["src","tests"]`, `exclude: [… "src/**/*.test.tsx"]`: o arquivo de teste **não** é type-checado, então quem pega um nome velho lá é `bun test`, não `tsc`

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /component
**Depends on:** T7
**Consumes (frozen):** de T7, verbatim — os nomes de wire `'integration.thread.stop_raised'` e `'integration.thread.stop_resolved'`, o tipo `ListenEventsQueryResponse` regenerado de `@codedm/client-typescript/typescript` (de onde `ServerEventName` deriva), e o fato de que `stop_resolved` agora carrega `threadId` no payload.
**Scope fence:** DONE: exatamente **três** edições de string/identificador. OUT — **é do B5, não toque**: os frames `browser.*` em `useThreadRealtime.ts` (linhas 20-21 do docblock, as entradas 24/25/26 da tupla, os `case` 55/61/64, o comentário 91 e o branch `'payload' in event` de `threadIdOf` 92-94), o factory `browserFrame` do teste (40-41) e suas 4 chamadas (87/100/121/132), o branch `name.startsWith('browser.')` do loop exaustivo (164-165), `dashboard/-components/HomeDashboard/index.tsx:25`, `components/console/AgentsRunningPill.tsx:10,18`. Nenhuma query key, nenhum mapeamento de invalidação e nenhuma subscrição muda de comportamento.
**Gate:** `cd packages/app/react && bun x tsc --noEmit && bun test` — exit 0 nos dois

### Step T8.1 — Proposed file: Modify `packages/app/react/src/routes/(app)/threads/$threadId/-hooks/useThreadRealtime.ts`

Duas linhas. Na tupla `THREAD_REALTIME_EVENTS`, a entrada da linha 32:

```typescript
	'integration.thread.stop_raised',
```

e o `case` da linha 65, que fica empilhado com o `case 'browser.stop_raised':` da linha 64 (o `browser.*` é do B5 — os dois labels continuam empilhados sobre o mesmo `return`):

```typescript
		case 'browser.stop_raised':
		case 'integration.thread.stop_raised':
			return [getNeedsYouPanelQueryKey(threadId), getSessionChatQueryKey(threadId), getSessionIssuesQueryKey(threadId)]
```

- [ ] `noFallthroughCasesInSwitch: true` está ligado, mas labels empilhados sem statements entre eles são legais — a forma atual não muda
- [ ] `noUnusedLocals: true` também: nenhum import muda nesta Task, então nada fica órfão

### Step T8.2 — Proposed file: Modify `packages/app/react/src/routes/(app)/threads/$threadId/-hooks/useThreadRealtime.test.tsx`

Uma linha, a 146:

```typescript
	it('a stop stales the needs-you panel', () => {
		const keys = threadInvalidations(wireFact('integration.thread.stop_raised', { threadId: THREAD, issueId: ISSUE }), THREAD)

		expect(keys).toContainEqual(getNeedsYouPanelQueryKey(THREAD))
	})
```

- [ ] O arquivo é EXCLUÍDO do `tsc` (`packages/app/react/tsconfig.json`), então o nome velho não seria erro de compilação; quem pega é `bun test` — o nome cai no `default` do switch, `threadInvalidations` devolve o próprio evento e o `toContainEqual` falha. Rodar `bun test` é obrigatório, `tsc` sozinho não cobre esta linha.
- [ ] O loop exaustivo (162-170) itera `THREAD_REALTIME_EVENTS` em runtime — cobre o nome novo automaticamente, nenhuma edição por nome ali

### Step T8.3 — Proposed file: Modify `.../-components/NeedsYouPanel/index.tsx`

Só o comentário das linhas 23-27, que se torna factualmente FALSO com o `threadId` novo no `stop_resolved`. Uma frase:

```tsx
	// (`stop_raised`) and never how to disappear: a resolution publishes `stop_resolved`, which since B4
	// DOES carry `threadId` — so it is this thread's frame and no longer needs the enricher's recomputed
	// status frame to stand in for it. The layout hook still invalidates on the status frame; wiring the
	// raw fact into the subscription is B5's call, not a silent change here.
```

- [ ] Comentário só. Nenhuma subscrição é acrescentada — ligar `integration.thread.stop_resolved` na tupla é decisão do B5 (é ele que reescreve a lista quando os `browser.*` saem), e fazê-lo aqui seria mudar comportamento sob o disfarce de um rename.

### Step T8.4 — Verde

- [ ] `cd packages/app/react && bun x tsc --noEmit` → exit 0 (o `satisfies readonly ServerEventName[]` da linha 34 volta a fechar)
- [ ] `cd packages/app/react && bun test` → 0 fail
- [ ] **Provar que o gate pode falhar:** reverter só a linha 32 para o nome antigo → `tsc` falha no `satisfies`; reverter só a linha 146 → `tsc` PASSA e `bun test` falha. Registrar as duas saídas no artefato do T11 (é a prova de que os dois gates são necessários, não redundantes).

### Step T8.5 — Commit

```bash
git add "packages/app/react/src/routes/(app)/threads/\$threadId"
git commit -m "fix(app-react): B4 — o front escuta integration.thread.stop_raised

Re-aponte MINIMO: a entrada da tupla THREAD_REALTIME_EVENTS, o case
correspondente e o nome no teste do mapa. Nada de comportamento muda — as query
keys, o guard de thread e as subscricoes seguem iguais, e os frames browser.* sao
do B5. O comentario do NeedsYouPanel deixa de afirmar que stop_resolved nao
carrega threadId, porque agora carrega.

O tsc do app-react e o gate do primeiro; o segundo so o bun test pega (o
tsconfig exclui *.test.tsx)."
```

---

## Task T9: `ThreadStatusDeriver` — as três leituras ganham um dono, e `shared/services/threadStatus.ts` morre

**Files to write:**
- Create: `packages/api/typescript/src/thread/services/ThreadStatusDeriver/ThreadStatusDeriver.ts`
- Create: `packages/api/typescript/src/thread/services/ThreadStatusDeriver/DrizzleThreadStatusDeriver.ts`
- Create: `packages/api/typescript/src/thread/services/ThreadStatusDeriver/MockThreadStatusDeriver.ts`
- Create: `packages/api/typescript/src/thread/services/ThreadStatusDeriver/index.ts`
- Create: `packages/api/typescript/src/thread/services/ThreadStatusDeriver/DrizzleThreadStatusDeriver.test.ts`
- Modify: `packages/api/typescript/src/thread/services/index.ts`
- Modify: `packages/api/typescript/src/thread/registry.ts`
- Delete: `packages/api/typescript/src/shared/services/threadStatus.ts`
- Modify: `packages/api/typescript/src/shared/services/index.ts`
- Modify: `packages/api/typescript/src/ui/usecases/GetHomeDashboard.ts`
- Modify: `packages/api/typescript/src/thread/usecases/GetSessionChat.ts`
- Modify: `packages/api/typescript/src/ui/services/BrowserFrameEnricher/BrowserFrameEnricher.ts`

**Files to read:**
- `packages/api/typescript/src/thread/services/ChannelConnectivity/` — o padrão EXATO a replicar (abstract class + `Drizzle*` + `Mock*` + `index.ts`, binding por env no `registry.ts`)
- `packages/api/typescript/src/shared/services/threadStatus.ts` — a precedência e o docblock que explicam por que a coluna `threads.status` não responde; ambos viajam
- `packages/api/typescript/src/ui/services/BrowserFrameEnricher/BrowserFrameEnricher.ts:180-215` — `statusFrame`/`deriveStatus` com as EXCLUSÕES (`excludeIssueId`/`excludeStopId`), que é por que a troca do enricher é no método puro e não nas leituras

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** opus
**Skills:** /service, /query, /test
**Depends on:** T5
**Consumes (frozen):** de T5, verbatim — o `INSTANCE_REGISTRY` de `packages/api/typescript/src/thread/registry.ts` já com o binding de `StopPolicyConfigRepository` (esta Task acrescenta o seu ao MESMO array, e é a única razão da dependência: nenhum símbolo de T5 é importado aqui).
**Scope fence:** DONE: o serviço, os dois callers da spec (`GetHomeDashboard`, `GetSessionChat`), a troca mecânica do import no `BrowserFrameEnricher` e a morte de `shared/services/threadStatus.ts`. OUT: apagar o `BrowserFrameEnricher` (é o B5); mudar a precedência (é a MESMA, movida); mudar o shape de resposta de qualquer read.
**Gate:** `cd packages/api/typescript && bun test src/thread/services/ThreadStatusDeriver src/ui src/thread/usecases/GetSessionChat.test.ts && bun x tsc -p tsconfig.build.json --noEmit` — exit 0 nos dois, e `grep -rn "deriveThreadStatus" packages/api/typescript` retorna vazio (AC-12)

### Step T9.1 — Scaffold

```bash
bun cli service thread ThreadStatusDeriver --print
```

**Exceção anotada:** o gerador de `service` emite **um** arquivo flat (`thread/services/ThreadStatusDeriver.ts`) + a linha no barrel `thread/services/index.ts` — ele não conhece a tríade `abstract + Drizzle* + Mock*` que `ChannelConnectivity` usa e que a spec pede (AC-12: "abstract class + implementação"). Usar `--print` para o corpo canônico e escrever o DIRETÓRIO de 4 arquivos à mão, no formato do vizinho.

**Lacuna de CLI registrada** (regra da casa "if you wrote it, the CLI should write it"): `bun cli service` deveria aceitar `--seam` (ou equivalente) e emitir a tríade + `index.ts`, que é a forma que TODOS os serviços com binding por env têm neste repo (`ChannelConnectivity`, `OpenIssuesReader`, `GroupMemberReader`, `ChannelSender`). Follow-up.

### Step T9.2 — Proposed file: Create `packages/api/typescript/src/thread/services/ThreadStatusDeriver/ThreadStatusDeriver.ts`

COMPLETE file:

```typescript
import { ThreadStatus } from '@codedm/contracts-typescript/wire/enums'

/**
 * What a thread's operating status is DERIVED from. Deliberately three booleans and no database
 * handle: the rule is a precedence, and a caller that already holds these facts (the frame enricher,
 * which gathers them EXCLUDING the issue/stop the current event just resolved) can apply it directly.
 */
export interface ThreadOperatingFacts {
	/** The operator's own pause flag — `threads.paused`, the only part that is genuinely stored. */
	paused: boolean
	/** An unresolved stop on this thread. */
	hasOpenStop: boolean
	/** A non-archived issue in WORKING on this thread. */
	hasWorkingIssue: boolean
}

/**
 * A thread's operating status — DERIVED, never read from `threads.status`.
 *
 * ### Why the stored column cannot answer this
 * `threads.status` is written in exactly three places: `Thread.create()` → IDLE, `pause()` → PAUSED,
 * `resume()` → IDLE. (`setStatus` exists but has no caller.) Nothing stamps it when an issue starts
 * working or a stop is raised — so the column holds only IDLE or PAUSED, forever, and any consumer
 * filtering it for RUNNING or NEEDS_ATTENTION matches nothing, ever. That is precisely what emptied
 * the Home page's "Sessões ativas" block while the same page's headline said an agent was working:
 * the headline counts WORKING issues, the block filtered a column that never says RUNNING.
 *
 * Precedence, highest first: the operator's pause beats everything (they asked for silence); an open
 * stop beats work in flight (something is waiting on a human); work in flight beats nothing.
 *
 * ### Why this is a DI service and not the pure function it used to be (B4, spec decision 7)
 * The precedence was already centralized as `shared/services/threadStatus.ts`. What was NOT centralized
 * was the READING: each of the three call sites rewrote the same "is there an open stop / a working
 * issue" query, which is how the same question came to have two answers (the live SSE frame said RUNNING
 * while the REST read said IDLE). The seam owns both halves now — the reads, per-thread and batched per
 * owner, and the precedence — following the shape `ChannelConnectivity` already uses in this context.
 *
 * `derive` stays PUBLIC and concrete on the abstract class: it is language-level, not env-swapped, and
 * the one caller that cannot use the reads needs it. `BrowserFrameEnricher` computes its facts with an
 * EXCLUSION (the issue/stop the event being enriched just closed) so the frame reflects the transition
 * without waiting on a read-after-write; no read method can express that, so it gathers its own facts
 * and applies the precedence through here.
 */
export abstract class ThreadStatusDeriver {
	/** One thread. Three reads: the pause flag, an open stop, a WORKING non-archived issue. */
	abstract forThread(threadId: string): Promise<ThreadStatus>
	/**
	 * Every thread of an owner, batched — three queries total, not three per thread. The dashboard lists
	 * every conversation, and a per-thread call there would be an N+1 on the app's landing screen.
	 * Threads with no row in the stop/issue reads default to their pause flag.
	 */
	abstract forOwner(ownerId: string): Promise<Map<string, ThreadStatus>>

	/** The precedence itself, moved verbatim from `shared/services/threadStatus.ts`. */
	derive(facts: ThreadOperatingFacts): ThreadStatus {
		if (facts.paused) return ThreadStatus.PAUSED
		if (facts.hasOpenStop) return ThreadStatus.NEEDS_ATTENTION
		if (facts.hasWorkingIssue) return ThreadStatus.RUNNING
		return ThreadStatus.IDLE
	}
}
```

### Step T9.3 — Proposed file: Create `packages/api/typescript/src/thread/services/ThreadStatusDeriver/DrizzleThreadStatusDeriver.ts`

COMPLETE file:

```typescript
import { injectable } from 'tsyringe-neo'
import { and, eq, isNull } from 'drizzle-orm'
import { DrizzleClient, tryCatchAsync } from '@codedm/core-typescript'
import { threads, stops, issues } from '@codedm/contracts/db'
import { IssueStatus, ThreadStatus } from '@codedm/contracts-typescript/wire/enums'
import { ThreadStatusDeriver } from './ThreadStatusDeriver'

@injectable()
export class DrizzleThreadStatusDeriver extends ThreadStatusDeriver {
	constructor(private db: DrizzleClient) {
		super()
	}

	async forThread(threadId: string): Promise<ThreadStatus> {
		const result = await tryCatchAsync(async () => {
			const [threadRow] = await this.db.select({ paused: threads.paused }).from(threads).where(eq(threads.id, threadId)).limit(1)
			if (!threadRow) return undefined
			// `limit(1)` on both: the question is EXISTENCE, and a thread with forty open stops must not
			// pay for thirty-nine rows nobody reads.
			const openStop = await this.db
				.select({ id: stops.id })
				.from(stops)
				.where(and(eq(stops.threadId, threadId), isNull(stops.resolvedAt)))
				.limit(1)
			const working = await this.db
				.select({ id: issues.id })
				.from(issues)
				.where(and(eq(issues.threadId, threadId), eq(issues.status, IssueStatus.WORKING), eq(issues.archived, false)))
				.limit(1)
			return this.derive({ paused: threadRow.paused, hasOpenStop: openStop.length > 0, hasWorkingIssue: working.length > 0 })
		})
		// A thread that cannot be read is IDLE rather than a throw: every caller is a READ MODEL feeding a
		// screen, and a status is a badge — the same posture `ChannelConnectivity` takes with `false`.
		return result.success && result.data ? result.data : ThreadStatus.IDLE
	}

	async forOwner(ownerId: string): Promise<Map<string, ThreadStatus>> {
		const result = await tryCatchAsync(async () => {
			const threadRows = await this.db.select({ id: threads.id, paused: threads.paused }).from(threads).where(eq(threads.ownerId, ownerId))
			const openStops = await this.db
				.select({ threadId: stops.threadId })
				.from(stops)
				.where(and(eq(stops.ownerId, ownerId), isNull(stops.resolvedAt)))
			const workingIssues = await this.db
				.select({ threadId: issues.threadId })
				.from(issues)
				.where(and(eq(issues.ownerId, ownerId), eq(issues.status, IssueStatus.WORKING), eq(issues.archived, false)))

			const withStop = new Set(openStops.map(s => s.threadId))
			const withWork = new Set(workingIssues.map(i => i.threadId))
			return new Map(
				threadRows.map(t => [
					t.id,
					this.derive({ paused: t.paused, hasOpenStop: withStop.has(t.id), hasWorkingIssue: withWork.has(t.id) }),
				]),
			)
		})
		return result.success ? result.data : new Map()
	}
}
```

### Step T9.4 — Proposed file: Create o Mock e o barrel

`MockThreadStatusDeriver.ts` — COMPLETE file:

```typescript
import { injectable } from 'tsyringe-neo'
import { ThreadStatus } from '@codedm/contracts-typescript/wire/enums'
import { ThreadStatusDeriver } from './ThreadStatusDeriver'

/** Test double — every thread reads IDLE by default. Suites exercising RUNNING / NEEDS_ATTENTION /
 *  PAUSED override with a stub, the same way `MockChannelConnectivity` is overridden for the
 *  not-connected paths. `derive` is inherited: the precedence is not a test seam. */
@injectable()
export class MockThreadStatusDeriver extends ThreadStatusDeriver {
	async forThread(_threadId: string): Promise<ThreadStatus> {
		return ThreadStatus.IDLE
	}

	async forOwner(_ownerId: string): Promise<Map<string, ThreadStatus>> {
		return new Map()
	}
}
```

`index.ts` — COMPLETE file:

```typescript
export { ThreadStatusDeriver, type ThreadOperatingFacts } from './ThreadStatusDeriver'
export { DrizzleThreadStatusDeriver } from './DrizzleThreadStatusDeriver'
export { MockThreadStatusDeriver } from './MockThreadStatusDeriver'
```

- [ ] `thread/services/index.ts`: acrescentar `export { ThreadStatusDeriver, type ThreadOperatingFacts, DrizzleThreadStatusDeriver, MockThreadStatusDeriver } from './ThreadStatusDeriver'`
- [ ] `thread/registry.ts`: acrescentar, junto do binding de `ChannelConnectivity` e com a mesma forma (real DB em `real` + `integration`, double em `mock`):

```typescript
	// Derived thread status: real table reads in real+integration, IDLE in mock. The seam exists because
	// the three READS behind the precedence were duplicated at every call site (spec decision 7).
	{ token: ThreadStatusDeriver, mock: MockThreadStatusDeriver, integration: DrizzleThreadStatusDeriver, real: DrizzleThreadStatusDeriver },
```

### Step T9.5 — Proposed file: Create `.../DrizzleThreadStatusDeriver.test.ts`

COMPLETE file:

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { IssueStatus, StopKind, ThreadStatus } from '@codedm/contracts-typescript/wire/enums'
import { TestBed, givenThread, givenIssue, givenStop } from '@test/support'
import { OPERATOR_ID } from '@auth/operator'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { ThreadStatusDeriver } from './ThreadStatusDeriver'

/**
 * AC-12 — the precedence AND the three reads in one place.
 *
 * The bug this closes is not a wrong rule, it is two implementations of the same question: the SSE frame
 * said RUNNING while the REST read said IDLE, because each call site wrote its own "is there work" query.
 * So the cases below exercise the PRECEDENCE against real rows, which is exactly what no test could do
 * while the rule was a pure function nobody fed from a database.
 */
describe('DrizzleThreadStatusDeriver — one answer to "what is this thread doing"', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let deriver: ThreadStatusDeriver

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
		deriver = testBed.resolve(ThreadStatusDeriver)
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('nothing happening → IDLE', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })

		expect(await deriver.forThread(thread.id.value)).toBe(ThreadStatus.IDLE)
	})

	it('a WORKING issue → RUNNING (the case the stored column never reported)', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		await givenIssue(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value, status: IssueStatus.WORKING })

		expect(await deriver.forThread(thread.id.value)).toBe(ThreadStatus.RUNNING)
	})

	it('US-7 — an open stop beats work in flight → NEEDS_ATTENTION', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		await givenIssue(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value, status: IssueStatus.WORKING })
		await givenStop(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value, kind: StopKind.APPROVAL_NEEDED })

		expect(await deriver.forThread(thread.id.value)).toBe(ThreadStatus.NEEDS_ATTENTION)
	})

	it('a THREAD-LEVEL stop (no issue) counts too — that is what decision 4 exists for', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		await givenStop(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value })

		expect(await deriver.forThread(thread.id.value)).toBe(ThreadStatus.NEEDS_ATTENTION)
	})

	it('the operator pause beats everything → PAUSED', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		await givenIssue(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value, status: IssueStatus.WORKING })
		await givenStop(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value })
		thread.pause()
		await testBed.resolve(ThreadRepository).save(thread)

		expect(await deriver.forThread(thread.id.value)).toBe(ThreadStatus.PAUSED)
	})

	it('forOwner batches — three threads, three statuses, and no N+1 on the dashboard', async () => {
		const idle = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const running = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const blocked = await givenThread(testBed, { ownerId: OPERATOR_ID })
		await givenIssue(testBed, { ownerId: OPERATOR_ID, threadId: running.id.value, status: IssueStatus.WORKING })
		await givenStop(testBed, { ownerId: OPERATOR_ID, threadId: blocked.id.value })

		const statuses = await deriver.forOwner(OPERATOR_ID)

		expect(statuses.get(idle.id.value)).toBe(ThreadStatus.IDLE)
		expect(statuses.get(running.id.value)).toBe(ThreadStatus.RUNNING)
		expect(statuses.get(blocked.id.value)).toBe(ThreadStatus.NEEDS_ATTENTION)
	})

	it('derive is the SAME rule the reads apply — the enricher path cannot drift from the REST path', async () => {
		expect(deriver.derive({ paused: true, hasOpenStop: true, hasWorkingIssue: true })).toBe(ThreadStatus.PAUSED)
		expect(deriver.derive({ paused: false, hasOpenStop: true, hasWorkingIssue: true })).toBe(ThreadStatus.NEEDS_ATTENTION)
		expect(deriver.derive({ paused: false, hasOpenStop: false, hasWorkingIssue: true })).toBe(ThreadStatus.RUNNING)
		expect(deriver.derive({ paused: false, hasOpenStop: false, hasWorkingIssue: false })).toBe(ThreadStatus.IDLE)
	})
})
```

### Step T9.6 — Os três callers

Proposed file: Modify `packages/api/typescript/src/ui/usecases/GetHomeDashboard.ts` — sai o import de `@shared/services`, entra o seam; o `toSummary` lê do Map.

```typescript
import { ThreadStatusDeriver } from '@thread/services/ThreadStatusDeriver'
```

```typescript
	constructor(
		private readonly db: DrizzleClient,
		private readonly statuses: ThreadStatusDeriver,
	) {
		super()
	}
```

```typescript
		// Status is DERIVED, never read from `threads.status` — that column only ever holds IDLE or
		// PAUSED (nothing stamps it when work starts), so filtering it for RUNNING/NEEDS_ATTENTION
		// matched nothing and "active sessions" was permanently empty while the headline right above it
		// counted a working agent. One batched call for the whole owner (B4, spec decision 7): the three
		// reads behind the precedence live in `ThreadStatusDeriver`, not here.
		const statuses = await this.statuses.forOwner(input.ownerId)

		const toSummary = (t: (typeof threadRows)[number]) => ({
			threadId: t.threadId,
			displayName: t.displayName,
			channelKind: (t.channelKind ?? ChannelKind.WHATSAPP) as ChannelKind,
			workspacePath: t.workspacePath ?? '',
			providers: t.providers as ProviderKind[],
			status: statuses.get(t.threadId) ?? ThreadStatus.IDLE,
			lastActivity: t.updatedAt.toISOString(),
		})
```

- [ ] Os `Set` locais `threadsWithWork`/`threadsWithStop` SAEM (eram só para o status). `openStops` e `allIssues` FICAM — servem `buildNeedsYou`, `agentsRunningNow`, `issuesOpened`/`issuesClosed`, saídas que nada disso substitui.

Proposed file: Modify `packages/api/typescript/src/thread/usecases/GetSessionChat.ts` — sai `deriveThreadStatus`, sai a query `workingIssues` inteira.

```typescript
import { ThreadStatusDeriver } from '../services/ThreadStatusDeriver'
```

```typescript
	constructor(
		private readonly db: DrizzleClient,
		private readonly statuses: ThreadStatusDeriver,
	) {
		super()
	}
```

```typescript
		// The header's status is DERIVED, like the dashboard's — `threads.status` only ever holds IDLE or
		// PAUSED, so reading it made a thread with an agent mid-run present itself as idle. The three reads
		// behind it live in `ThreadStatusDeriver` since B4; the `stopRows` query above stays because the
		// payload needs the STOPS THEMSELVES (`activeStops`), not the boolean.
		const status = await this.statuses.forThread(input.threadId)
```

```typescript
				status,
```

- [ ] A query `workingIssues` (linhas ~106-109) e o import de `issues`/`IssueStatus` saem — `noUnusedLocals` acusa se ficarem

Proposed file: Modify `.../BrowserFrameEnricher/BrowserFrameEnricher.ts` — a troca MECÂNICA que a spec pede (decisão 7): o import sai de `@shared/services`, o seam entra, e a única linha de corpo que muda é a chamada.

```typescript
import { ThreadStatusDeriver } from '@thread/services/ThreadStatusDeriver'
```

```typescript
	constructor(
		private readonly db: DrizzleClient,
		private readonly statuses: ThreadStatusDeriver,
	) {}
```

```typescript
	/**
	 * The precedence itself lives in `ThreadStatusDeriver.derive` — this method's job is only to gather
	 * the three facts, and to gather them EXCLUDING the issue/stop the current event just resolved, so the
	 * frame reflects the transition without waiting on a read-after-write. That exclusion is why it calls
	 * the pure half of the seam rather than `forThread`.
	 */
	private async deriveStatus(threadId: string, exclude: { excludeIssueId?: string; excludeStopId?: string }): Promise<ThreadStatus> {
```

```typescript
		return this.statuses.derive({
			paused: await this.isPaused(threadId),
			hasOpenStop: openStops.success && openStops.data.some(s => s.id !== exclude.excludeStopId),
			hasWorkingIssue: working.success && working.data.some(i => i.id !== exclude.excludeIssueId),
		})
```

- [ ] Nada mais no enricher muda. O arquivo inteiro morre no B5; a única razão de tocá-lo aqui é permitir apagar `shared/services/threadStatus.ts` **sem re-export temporário**, que é literalmente o que a decisão 7 pede.

### Step T9.7 — Matar o `shared/services/threadStatus.ts`

- [ ] `git rm packages/api/typescript/src/shared/services/threadStatus.ts`
- [ ] `shared/services/index.ts`: remover a linha 3 (`export { deriveThreadStatus, type ThreadOperatingFacts } from './threadStatus'`)
- [ ] `grep -rn "deriveThreadStatus\|shared/services/threadStatus" packages/api/typescript` → **vazio** (AC-12)

### Step T9.8 — Verde

- [ ] `cd packages/api/typescript && bun test src/thread/services/ThreadStatusDeriver src/ui src/thread/usecases/GetSessionChat.test.ts` → 0 fail
- [ ] `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` → exit 0
- [ ] `cd packages/api/typescript && bun test` → 0 fail (nenhuma resposta de read mudou de shape; `MockThreadStatusDeriver` devolve IDLE, então suítes em `mock` que assertavam status precisam do stub — conferir `src/ui/usecases/GetHomeDashboard.test.ts` e `GetSessionChat.test.ts`, que rodam em `integration` e portanto pegam a implementação Drizzle real)

### Step T9.9 — Commit

```bash
git add packages/api/typescript/src/thread/services packages/api/typescript/src/thread/registry.ts \
        packages/api/typescript/src/thread/usecases/GetSessionChat.ts \
        packages/api/typescript/src/shared/services \
        packages/api/typescript/src/ui
git commit -m "refactor(thread,ui): B4 — ThreadStatusDeriver e a morte de shared/services/threadStatus

A precedencia estava centralizada; as TRES LEITURAS que a alimentam estavam
reescritas em cada um dos 3 call sites — que e como a mesma pergunta passou a ter
duas respostas (o frame SSE dizia RUNNING e o read REST dizia IDLE). O seam
(abstract + Drizzle* + Mock*, no formato de ChannelConnectivity) possui as duas
metades: forThread, forOwner batched (o dashboard lista tudo — per-thread ali
seria N+1) e derive, a precedencia movida verbatim.

BrowserFrameEnricher troca o import mecanicamente para derive porque as facts
dele sao EXCLUDENTES (o issue/stop que o evento acabou de fechar) e nenhuma
leitura expressa isso — e e o que permite apagar threadStatus.ts aqui, sem
re-export temporario. O enricher inteiro morre no B5."
```

---

## Task T10: a regra de tabela-filha entra nas skills, com par TS e Go

**Files to write:**
- Modify: `.claude/skills/repository/typescript/registry.yaml`
- Modify: `.claude/skills/repository/typescript/SKILL.md`
- Modify: `.claude/skills/repository/go/registry.yaml`
- Modify: `.claude/skills/repository/go/SKILL.md`
- Modify: `packages/api/typescript/src/issue/entities/Issue.ts` — a linha 44

**Files to read:**
- `.claude/skills/repository/typescript/registry.yaml` — **ler uma entrada existente de `bad_practices` ANTES de escrever**: o formato (id, severity, `mechanical`, título, `bad`/`good`, `why`) não é adivinhável
- `.claude/skills/repository/go/registry.yaml` — idem, e conferir o prefixo de id daquele variant (`REPO-GO-nn`)
- `.claude/registry.yaml` — se a regra tiver contrapartida cross-cutting, o id `cc-bp-nn` seguinte

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /repository, /review
**Depends on:** T6
**Consumes (frozen):** de T3/T5/T6, verbatim — os nomes que viram exemplos: `TranscriptRepository` e `StopRepository` (negativos, agora inexistentes), `TerminalLineRepository` + a linha de justificativa em `Issue.ts` (positivo TS), `ConsumedMessageRepository` e `MailboxRepository` (positivos-infra), e do lado Go `SqliteChannelRepository` / `SqliteRemoteRepository` + `SqliteRemoteProjectionRepository` / `gateway_remote_memberships` (do inventário deste plano).
**Scope fence:** DONE: uma entrada de bad practice em cada variant + a correção redacional de `Issue.ts:44`. OUT: mexer em qualquer outro repositório (o inventário fechou 0 follow-ups), e mexer no `Save` largo da projeção Go (observação O5, decisão do founder).
**Gate:** `bun test:tooling && bun lint` — exit 0 nos dois (os registries carregam e os gates de taxonomia passam)

### Step T10.1 — Ler o formato antes de escrever

- [ ] `grep -n "^  - id:" .claude/skills/repository/typescript/registry.yaml | head` e ler UMA entrada inteira de `bad_practices`; anotar as chaves e o próximo id livre
- [ ] Idem em `.claude/skills/repository/go/registry.yaml` (prefixo `REPO-GO-`)
- [ ] Conferir se `.claude/registry.yaml` precisa de um `cc-bp-nn` correspondente. Critério do B3: entra no cross-cutting quando a regra vale para as duas linguagens e é detectável por caminho de arquivo. **Esta vale** — é princípio de DDD, não particularidade de linguagem, e a spec a rotula "de template". Acrescentar com `severity: warning` e **sem** `mechanical: true` (a decisão exige julgamento: é preciso ler o agregado pai para saber se a justificativa existe).

### Step T10.2 — A entrada em `repository/typescript/registry.yaml`

Conteúdo normativo (encaixar no formato lido no T10.1):

**Título:** repositório de tabela-filha sem entidade correspondente exige justificativa explícita de lifecycle/escala documentada no AGREGADO PAI.

**Regra:** um `abstract class XRepository {` pelado (sem `extends Repository<T>`) sobre uma tabela que não tem entidade em `<ctx>/entities/` é legítimo em exatamente dois casos: (1) é INFRA — ledger de idempotência, outbox, fila, e não um modelo de domínio; (2) é tabela-filha de um agregado E o agregado pai carrega, na sua própria docstring, a razão de lifecycle/escala pela qual ela fica de fora. Fora desses dois casos, a tabela é PARTE do agregado: a escrita passa por um método dele, e a persistência pelo repositório do agregado, na mesma transação.

**Exemplo negativo 1 —** `thread/repositories/TranscriptRepository` (eliminado no B4). Docstring prometia "The TranscriptEntry store... A distinct entity within BC4" e não existia entidade `TranscriptEntry`; `DrizzleTranscriptRepository.append()` mintava o id com `crypto.randomUUID()` dentro do insert e gravava o que recebia, sem ninguém para validar que a entry citada pertencia à thread ou que uma linha `CONTACT` trazia sender. O agregado pai (`Thread`) *mencionava* a separação — "The transcript + pending clarifications are separate entities/records, not embedded here" — mas isso é **enunciado do fato, não justificativa**: nem lifecycle, nem escala. A razão real morava na docstring do próprio repositório, que é o sintoma que esta regra caça.

**Exemplo negativo 2 —** `issue/repositories/StopRepository` (eliminado no B4). Mesmo shape, e um agravante: a justificativa que ele *tinha* (`Issue.ts`, "Stops + the terminal log are separate tables (own lifecycles/scale)") era de segunda mão — cobria duas tabelas numa linha, e para a Stop era falsa: ela não tinha lifecycle próprio, tinha um `issueId` obrigatório que *impedia* o caso de negócio de stop sem issue. Uma justificativa que cobre N tabelas de uma vez é uma bandeira: verifique cada uma.

**Exemplo negativo 3 (variação: justificativa no lugar errado) —** `StopPolicyConfigRepository` antes do B4. A justificativa existia e era boa — "demoted from an aggregate to a settings row" — mas morava **no próprio repositório**, e no contexto errado. Uma settings row per-owner não tem agregado pai onde a justificativa caiba; o que se corrige é o ENDEREÇO (ela mudou para o contexto que possui os stops que a policy governa).

**Exemplo positivo 1 (tabela-filha justificada) —** `issue/repositories/TerminalLineRepository`, com a linha correspondente em `Issue.ts`: *"the terminal log is a separate table (own lifecycle/scale)"*. É replay T12, log de transporte, escala própria — o agregado não quer nem consegue carregá-lo. A justificativa está no PAI, nomeia o motivo, e é verificável.

**Exemplo positivo 2 (infra) —** `ConsumedMessageRepository` (latch exactly-once, `INSERT ... ON CONFLICT DO NOTHING` sobre `UNIQUE(channelId, platformMessageId)`) e `MailboxRepository` (fila durável por target, com lease e poison). Nenhum dos dois é modelo de domínio; nenhum precisa de justificativa em agregado nenhum.

**Exemplo positivo 3 (o shape correto pós-correção) —** `ThreadRepository`: `save(thread, tx)` dreno `thread.pullPendingWrites()` e grava a tabela-filha no MESMO `dbc` da linha do agregado; as leituras que sobram (`recentEntries`, `findEntry`, `openStops`) são superfície do repositório do agregado, não um segundo repositório; `findById` NÃO hidrata histórico.

**Detecção:** `grep -rn "^export abstract class .*Repository {" packages/api/typescript/src` lista os candidatos (o tell é a ausência de `extends Repository<T>`); para cada um, `ls <ctx>/entities/` e — se não houver entidade — procurar a justificativa na docstring do agregado pai.

### Step T10.3 — O PAR em `repository/go/registry.yaml`, com exemplos Go REAIS

Mesma regra (é DDD, não linguagem), instanciada na convenção Go e com os três exemplos da varredura:

**Exemplo positivo (o agregado inteiro) —** `internal/channel/repositories/channel/sqlite_channel_repository.go`: `Find` hidrata via `hydrateChannel` → `entities.ReconstructChannel(...)` (nunca por um construtor de negócio), e `Save` tem `events := ch.PullDomainEvents()` como PRIMEIRA instrução, `SaveAll` a seguir, e só então o `INSERT ... ON CONFLICT(id) DO UPDATE`. É a forma completa: hidratar por reconstrutor, drenar eventos antes do upsert.

**Exemplo positivo-sutil (duas escritas na MESMA tabela, colunas disjuntas por contrato) —** o repositório do agregado `remote` e o `RemoteProjectionRepository` escrevem ambos `gateway_remotes`. Não é violação: são subconjuntos de coluna DECLARADAMENTE disjuntos, e o contrato está escrito no código — `sqlite_remote_repository.go`: *"`name` is projection-owned: bound as '' on insert and never touched on conflict, so a projector-written display name survives an aggregate save."* A lição: duas escritas na mesma tabela são legítimas quando a fronteira é por COLUNA e está documentada nos dois lados. **Cuidado real, encontrado na varredura:** o `Save` LARGO da projeção reclama 6 colunas do agregado no `ON CONFLICT DO UPDATE` (`type`, `pinned_at`, `archived`, `mute_expiration`, `marked_as_unread`, `deleted_at`), então a disjunção vale numa direção só. Um contrato de coluna que só um lado honra é meio contrato — verifique os dois `ON CONFLICT`, não só o do agregado.

**Exemplo de armadilha-justificada —** `gateway_remote_memberships`: tabela sem entidade E sem struct de projeção, escrita SÓ pelo `RemoteProjectionRepository` (`UpdateMembership`/`AddMember`/`RemoveMember`/`BulkUpdateMemberships`). Legítima, e a razão é precisa: a membership **não tem identidade própria** — a única representação em código é um `MembershipRow` sem campo de id, a identidade é a chave composta `ON CONFLICT(channel_id, group_id, member_id)`, e o conjunto é substituído por inteiro (DELETE-all + batch INSERT dentro de `inTx`). É relationship set de read-model, não child aggregate. O teste para distinguir uma da outra: **a linha tem lifecycle próprio (nasce, muda de estado, morre) ou é reposta em bloco?** Se é reposta em bloco, não há invariante para um agregado guardar.

**Detecção (Go):** `find packages/api/go/internal/*/repositories -mindepth 1 -type d` + para cada tabela escrita, procurar `internal/<ctx>/entities/` e `internal/<ctx>/projections/`. Zero violações no estado atual (6 repositórios).

- [ ] Acrescentar aos DOIS `SKILL.md` um parágrafo curto de filosofia com um ponteiro para a entrada do registry — sem duplicar os exemplos (o registry é a fonte)

### Step T10.4 — Proposed file: Modify `packages/api/typescript/src/issue/entities/Issue.ts`

A linha 44 cita "Stops" como parte do que fica de fora, o que o B4 invalida para Stop. Uma frase (o único toque desta Task em código de produção):

```typescript
/**
 * `Issue` (BC5 Issue Execution, Core) — a unit of concurrent work with its own terminal session.
 * Invariants: `key` unique within the thread (DB-enforced); lifecycle NEEDS_INPUT → WORKING →
 * COMPLETED, plus archive (MANUAL / AUTO_24H / THREAD_DETACHED) and restore. The terminal log is a
 * separate table (own lifecycle/scale: T12 replay of a transport log, unbounded per issue).
 * Stops are NOT here any more — since B4 a Stop is a child of the `Thread` aggregate (it can exist
 * without an issue at all), so `Thread.raiseStop`/`resolveStop` own it and this line no longer covers it.
 */
```

- [ ] A cláusula "stops only while not archived (guarded by RaiseStop)" também sai da lista de invariantes — a guarda vive em `thread/usecases/RaiseStop` desde o T6, e ela lê a flag `archived` em vez de chamar `assertNotArchived()`

### Step T10.5 — Gates e commit

- [ ] `bun test:tooling` → exit 0
- [ ] `bun lint` → exit 0
- [ ] `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` → exit 0
- [ ] `bun review --backend --context thread` → nenhum finding novo da regra recém-adicionada contra o código do B4 (se aparecer, o exemplo positivo está mal escrito ou o código está errado — as duas coisas valem descobrir agora)

```bash
git add .claude/skills/repository packages/api/typescript/src/issue/entities/Issue.ts
git commit -m "docs(skills): B4 — tabela-filha exige justificativa no agregado pai (par TS e Go)

repository/typescript e repository/go recebem a MESMA entrada (e DDD, nao
particularidade de linguagem), cada uma instanciada na convencao da sua
linguagem. TS: negativos TranscriptRepository/StopRepository (eliminados nesta
frente) + StopPolicyConfigRepository (justificativa no lugar errado); positivos
TerminalLineRepository (com a linha em Issue.ts), ConsumedMessage/Mailbox (infra)
e o shape correto do ThreadRepository. GO: positivo SqliteChannelRepository
(ReconstructChannel + PullDomainEvents antes do upsert), positivo-sutil as duas
escritas de gateway_remotes com colunas disjuntas por contrato (com o achado de
que o Save largo da projecao reclama 6 colunas do agregado), e a
armadilha-justificada gateway_remote_memberships (relationship set sem
identidade, reposto em bloco).

Issue.ts perde a mencao a Stops na justificativa de tabela-filha — o B4 a
invalida para Stop e a mantem para o terminal log."
```

---

## Task T11: fechamento — os greps re-rodados e o mapa AC-1..AC-17

**Files to write:**
- Create: `.plans/artifacts/2026-07-30-b4-aggregate-boundaries-closure.md`

**Files to read:**
- `.specs/2026-07-29-aggregate-boundaries-design.md` — os 17 ACs que o artefato mapeia
- `.plans/artifacts/2026-07-29-b3-activation-closure.md` — o molde do artefato de fechamento

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** haiku
**Skills:** /test
**Depends on:** T7, T8, T9, T10
**Consumes (frozen):** o Inventário deste plano (16 repositórios TS com 3 VIOLA corrigidos; 6 Go com zero violações) e os caminhos de teste de T1-T10 para o mapa AC→teste.
**Scope fence:** DONE: todo o código, todos os contratos, o front e as duas skills. OUT: qualquer mudança de código — esta Task só MEDE e registra. Nenhuma Task deste plano toca o `.specs/2026-07-30-rust-wire-and-tauri-sdk-design.md` (spec nova do founder, não versionada).
**Gate:** `bun tsc && bun lint && bun test && bun detect && bun check:generated && bun test:tooling && cd packages/e2e && bun run test` — exit 0 em todos

### Step T11.1 — Os greps de fechamento (TS)

Run: `grep -rn "^export abstract class .*Repository {" packages/api/typescript/src`
Expected: exatamente **3** linhas — `MailboxRepository` (agent), `ConsumedMessageRepository` (thread), `TerminalLineRepository` (issue) — mais `StopPolicyConfigRepository` (thread) se a forma dele casar o padrão. Os dois que saíram (`TranscriptRepository`, `StopRepository`) não aparecem. Cada sobrevivente cai num dos dois casos legítimos da regra nova: infra (Mailbox, ConsumedMessage), tabela-filha justificada no pai (TerminalLine), settings row com justificativa no próprio arquivo e no contexto dono (StopPolicyConfig).

Run: `grep -rn "TranscriptRepository\|StopRepository" packages/api/typescript | grep -v StopPolicyConfigRepository`
Expected: **vazio** (AC-4, AC-8).

Run: `grep -rn "deriveThreadStatus\|shared/services/threadStatus" packages/api/typescript`
Expected: **vazio** (AC-12).

Run: `grep -rn "integration.issue.stop\|IssueStopRaisedEvent\|IssueStopResolvedEvent" packages/api packages/contracts packages/client packages/app packages/e2e`
Expected: **vazio** (AC-15).

Run: `grep -rn "@issue/repositories/StopPolicyConfigRepository" packages/api/typescript`
Expected: **vazio** (AC-16).

### Step T11.2 — O grep de fechamento (Go)

Run: `find packages/api/go/internal/*/repositories -mindepth 1 -type d | sort`
Expected: 3 diretórios (`channel/channel`, `channel/message`, `channel/remote`), inalterados — o B4 não toca repositório Go.

Run: `grep -rn "issue_stops\|thread_stops" packages/api/go/`
Expected: os mesmos **22** hits do inventário, todos em `core/db/sqlite/` (DDL + query sqlc + gerados), `thread_stops` = 0 — a decisão D-A é *não renomear*, então o número não muda. Se `thread_stops` aparecer, o rename escapou e a Task 4 saiu do escopo.

Run: `grep -rn "IssueStopRaised\|IssueStopResolved" packages/api/go/`
Expected: **vazio** — o wire regenerado só carrega `ThreadStopRaised`/`ThreadStopResolved`.

### Step T11.3 — Proposed file: Create `.plans/artifacts/2026-07-30-b4-aggregate-boundaries-closure.md`

Escreva o artefato com: (a) a saída VERBATIM dos greps de T11.1/T11.2; (b) a tabela AC-1..AC-17 → caminho de teste/evidência, copiada do bloco Final Validation abaixo com os resultados reais; (c) as saídas dos sete gates; (d) as saídas dos **cinco falseadores provados** (T1.5 ×2, T5.7 ×1, T8.4 ×2 — cada um com o guard/linha desligado e o teste vermelho, depois restaurado); (e) o inventário completo TS+Go deste plano, com as três reclassificações justificadas; (f) as observações O1-O6 das Notes, marcadas como pendências de decisão do founder.

### Step T11.4 — Gates completos

Run: `bun tsc` → exit 0
Run: `bun lint` → exit 0
Run: `bun run test` → 0 fail (nx run-many, exclui e2e)
Run: `bun detect` → exit 0
Run: `bun check:generated` → exit 0 (contratos renomeados + SDK regenerado, sem deriva)
Run: `bun test:tooling` → exit 0 (registries das skills + o gate de igualdade de bytes das migrações)
Run: `cd packages/e2e && bun run test` → exit 0 (`bun e2e` NÃO é usado neste repo). `08-stop-resolve.spec.ts` continua `test.skip`'d — o harness hermético não tem caminho para LEVANTAR um stop; o B4 não muda isso.

### Step T11.5 — Commit

```bash
git add .plans/artifacts/2026-07-30-b4-aggregate-boundaries-closure.md
git commit -m "docs(plans): B4 — artefato de fechamento (greps citados + mapa AC->teste)

TS: 16 repositorios inventariados, 3 VIOLA corrigidos (Transcript, Stop,
StopPolicyConfig-no-lugar-errado), 3 legitimos que sobram e por que. GO: 6
repositorios, zero violacoes, com os tres exemplos reais que alimentaram a skill.
Cinco falseadores provados com o guard desligado. Zero instancias do padrao fora
do inventario nas duas linguagens (AC-17)."
```

---

## Final Validation

- [ ] `bun tsc` — type check completo, exit 0
- [ ] `bun lint` — exit 0
- [ ] `bun run test` — 0 fail (todos os workspaces exceto e2e)
- [ ] `bun detect` — exit 0, sem findings novos
- [ ] `bun check:generated` — exit 0 (os dois contratos renomeados + SDK regenerado não derivaram)
- [ ] `bun test:tooling` — exit 0 (registries das skills carregam; o gate byte-a-byte das migrações passa)
- [ ] `bun run --cwd packages/contracts db:check-go` — exit 0
- [ ] `cd packages/api/typescript && bun scripts/dump-sqlite-schema.ts --check` — exit 0
- [ ] `cd packages/api/go && go build ./... && go test ./...` — exit 0
- [ ] `cd packages/app/react && bun x tsc --noEmit && bun test` — exit 0 nos dois (o tsconfig do app exclui `*.test.tsx`, então os dois gates são necessários)
- [ ] `cd packages/e2e && bun run test` — exit 0 (suíte completa; `bun e2e` NÃO é usado neste repo)
- [ ] AC mapping (todo AC da spec → ≥1 caminho de teste):
  - AC-1 → `src/thread/entities/Thread.test.ts:"AC-1 FALSEADOR — a citation of an entry from ANOTHER thread is rejected and nothing is accumulated"` (entidade, sem DB) + o par vermelho→verde do Step T1.5
  - AC-2 → `src/thread/entities/Thread.test.ts:"AC-2 FALSEADOR — CONTACT without a sender is rejected"` e `:"AC-2 FALSEADOR — SYSTEM and WHISPER carrying a contact sender are both rejected"`
  - AC-3 → `src/thread/repositories/ThreadRepository/DrizzleThreadRepository.test.ts:"AC-3 — save(thread, tx) persists the thread row AND the accumulated entries"` + `:"AC-3 FALSEADOR — a rolled-back transaction leaves NEITHER a new entry NOR the thread bump"` + `:"AC-3 — the stop and the thread roll back together"`
  - AC-4 → Step T3.8 e T11.1 (grep `TranscriptRepository` vazio em `packages/api/typescript`) — a classe e os dois implementadores não existem mais
  - AC-5 → `src/thread/usecases/{SteerThread,SendDirectMessage,IngestChannelMessage,RecordOrchestratorReply}.test.ts` (os quatro verdes após T3) + o mesmo grep. Nota de correção de escopo: o quarto writer é o USE CASE `RecordOrchestratorReply`, não o handler `DeliverOrchestratorReply` — o B3 moveu o corpo transacional para o use case e a spec (escrita antes do B3) ainda cita o handler
  - AC-6 → `src/agent/usecases/RunOrchestratorTurn.test.ts` (janela de contexto: mesmo limite via `bufferLimit(bufferSize)`, mesma ordenação cronológica) + `DrizzleThreadRepository.test.ts:"recentEntries returns the LAST n, chronological; findEntry resolves a citation with its threadId"`
  - AC-7 → `DrizzleThreadRepository.test.ts:"AC-7 — save persists a stop with issue_id NULL, and the read returns it"` e `:"AC-7 — resolveStop stamps resolution + resolvedAt regardless of whether the stop has an issue"` + `Thread.test.ts:"US-5 — a stop with NO issue is raised…"`
  - AC-8 → Step T6.10 e T11.1 (grep `StopRepository` vazio, excluída a policy) + `src/thread/usecases/ResolveStop.ts` orquestrando por `ThreadRepository` + os métodos do agregado
  - AC-9 → `src/thread/usecases/GetNeedsYouPanel.ts` com `leftJoin` + `issueId`/`issueKey` opcionais no `OutputSchema`; provado por `tests/flows/stop-control-plane.flow.test.ts` (caso novo do Step T7.3: stop sem issue aparece no painel)
  - AC-10 → `DrizzleThreadStatusDeriver.test.ts:"a THREAD-LEVEL stop (no issue) counts too"` (o caminho de `GetHomeDashboard.needsYou`/`GetSessionChat.activeStops` é o mesmo predicado `threadId + resolvedAt IS NULL`, que nunca dependeu de `issueId`) + `src/ui/usecases/GetHomeDashboard.test.ts` e `src/thread/usecases/GetSessionChat.test.ts` sem regressão
  - AC-11 → `.claude/skills/repository/typescript/registry.yaml` (entrada nova de `bad_practices`), provado por `bun test:tooling`; `TerminalLineRepository` e `ConsumedMessageRepository` seguem existindo e cada um cai num dos dois casos legítimos (Step T11.1)
  - AC-12 → `src/thread/services/ThreadStatusDeriver/` (abstract + `Drizzle*` + `Mock*` + `index.ts`) + `DrizzleThreadStatusDeriver.test.ts` completo + grep `deriveThreadStatus` vazio (T9.7)
  - AC-13 → `src/ui/usecases/GetHomeDashboard.ts` (`statuses.forOwner`, sem os `Set` locais) e `src/thread/usecases/GetSessionChat.ts` (`statuses.forThread`, sem a query `workingIssues`); `DrizzleThreadStatusDeriver.test.ts:"derive is the SAME rule the reads apply"` prova que o caminho do enricher não pode divergir do REST
  - AC-14 → `bun tsc` + `bun run test` nos gates acima, e os gates por Task de T1-T10
  - AC-15 → `packages/contracts/wire/events/thread-stop-{raised,resolved}.tsp` com `integration.thread.stop_{raised,resolved}`, `issueId?` nos dois e `threadId` em ambos; `bun check:generated` + o grep vazio de `integration.issue.stop` (T7.4, T11.1)
  - AC-16 → `packages/api/typescript/src/thread/repositories/StopPolicyConfigRepository/` + `thread/usecases/RaiseStop.ts` lendo a policy de lá; grep de import cross-context vazio (T6.10, T11.1)
  - AC-17 → a seção "Inventário (rodada de pesquisa TS+Go)" deste plano (16 TS + 6 Go, cada um classificado, 0 follow-ups de outros contextos) + `.claude/skills/repository/go/registry.yaml` com a mesma regra e os três exemplos Go REAIS + `.plans/artifacts/2026-07-30-b4-aggregate-boundaries-closure.md`

## Notes

- **`bun e2e` NÃO é usado neste repo** — o script é `cd packages/e2e && bun run test`.
- **A spec antecede o B3 em dois pontos, e o plano corrige os dois.** (1) O quarto call site de `append` é o USE CASE `RecordOrchestratorReply`, não o handler `DeliverOrchestratorReply` — o B3 moveu o corpo transacional para o use case, então o risco "DeliverOrchestratorReply não é transacional hoje" (Risks & Migration) **já estava resolvido antes do B4 começar**; o handler é fino e delega. (2) `SendDirectMessage` e `RecordOrchestratorReply` usam `entry.entryId` como `jobId` do `enqueueCommand`, o que é a razão dura pela qual `recordEntry` tem de mintar o id SINCRONAMENTE — um id que só existisse depois do `save` não poderia ser referenciado pelas linhas que commitam com ele.
- **O1 (dúvida genuína ao founder, não virou desvio silencioso).** A spec é **silenciosa sobre a LOCALIZAÇÃO** de `RaiseStop`/`ResolveStop`/`GetNeedsYouPanel`/`UpdateStopCriteriaConfig` e dos seus controllers. Ela nomeia explicitamente o que migra (contratos, `StopPolicyConfigRepository`, os domain events + o publisher) e lista os use cases apenas como "consumidores a ajustar". O plano os MIGRA (T6) porque a alternativa — um use case em `issue/` importando `@thread/entities/Thread` e chamando `threads.save()` — viola `docs/BACKEND.md:170` (proibido importar entidade de outro contexto) e `:173`/`:414` (mudar o estado de outro contexto só por integration event). É a mesma lógica "o contexto dono" que o founder usou para os eventos, estendida aos comandos. **O custo é baixo e verificado:** nenhum path HTTP muda (o mount é uniforme e o controller possui o path), então nem SDK nem front mudam — só a tag OpenAPI. Se o founder preferir manter o B4 literal (repos + eventos, use cases ficando em `issue/`), isso tem de ser registrado como desvio aceito de `docs/BACKEND.md`, não como omissão.
- **O2 (observação, NÃO virou Task).** `GetIssueDetail` (`issue/usecases/`) fica onde está e continua filtrando `stops` por `issueId`. Com a coluna nullable ela simplesmente deixa de ver stops sem issue — que é o comportamento esperado pela própria spec (eles pertencem à tela de thread). É read de forma-de-issue que junta stops, não um comando sobre stop, logo não migra.
- **O3 (observação, NÃO virou Task).** `AskOperatorInputSchema.issueId` e `AgentRunStopRaisedEventSchema.issueId` continuam OBRIGATÓRIOS depois do B4. O B4 abre o caminho (contrato + agregado + `RaiseStopInputSchema` com `issueId` opcional); quem exercita o stop de nível-thread é a tool do orquestrador, e a spec ordena B4 antes de B2 exatamente por isso (Risks & Migration). Relaxar essas duas aqui seria construir metade de uma feature de outra frente.
- **O4 (observação, NÃO virou Task).** `Thread.setStatus` continua sem call site, e agora com um segundo motivo: `ThreadStatusDeriver` estabelece que o status é DERIVADO. O candidato natural é apagar `setStatus` e a coluna `threads.status` junto — mas `GetSessionChat`/`GetHomeDashboard` ainda a leem para NADA e a coluna tem `NOT NULL` + CHECK, então é migração destrutiva. Decisão do founder.
- **O5 (observação, NÃO virou Task — lado Go).** O contrato de colunas disjuntas de `gateway_remotes` é honrado pelo repositório do agregado (`sqlite_remote_repository.go:108-110`) e **quebrado pelo `Save` largo da projeção**, que reclama 6 colunas do agregado no `ON CONFLICT DO UPDATE` (`type`, `pinned_at`, `archived`, `mute_expiration`, `marked_as_unread`, `deleted_at`) e é chamado por `remote_projector.go:38,126,191`. Achado da varredura da decisão 6b; entrou na skill `repository/go` como advertência ("verifique os DOIS `ON CONFLICT`"), mas corrigir o código é fora das Decisions desta spec.
- **O6 (observação, NÃO virou Task — lado Go).** Quatro writers de `gateway_remote_memberships` gerados por sqlc (`core/db/sqlite/gen/channel.sql.go:41,59,68,585`) têm **zero chamadores**. Dead code de codegen; limpar exige mexer em `query/channel.sql` e rodar `sqlc generate`.
- **Follow-ups de CLI (regra da casa "if you wrote it, the CLI should write it").** Dois, ambos descobertos escrevendo este plano: (1) `bun cli service` emite um arquivo flat, mas TODO serviço com binding por env neste repo é a tríade `abstract + Drizzle* + Mock*` + `index.ts` (`ChannelConnectivity`, `OpenIssuesReader`, `GroupMemberReader`, `ChannelSender`) — falta um `--seam`; (2) `bun cli handler` emite `<Pascal>Handler.ts`, sufixo que nenhum handler do repo usa. Abrir os dois antes do PR do B4 fechar.
- **Follow-up de migração.** O rename físico `issue_stops` → `thread_stops` (decisão D-A), numa frente própria, junto com: os 3 `core/db/sqlite/query/*.sql` do Go, `sqlc generate`, o dump do `schema.sql`, e o rename dos dois CHECK (`issue_stops_kind_check`, `issue_stops_resolution_check`).
- **Nenhuma Task deste plano toca `.specs/2026-07-30-rust-wire-and-tauri-sdk-design.md`.** É spec nova do founder, não rastreada — se algum gate reclamar dela, PARE e reporte.

### O que o `bun scripts/review-plan.ts` achou, e o veredito de cada achado

24 arquivos virtuais revisados. **Três defeitos reais, corrigidos no plano:**

1. **Casts redundantes** (`cc-bp-04`, `REPO-P11`). `DrizzleTranscriptRepository.toRow` tinha quatro `as` que eram no-op — `thread_transcript_entries` declara `kind`/`provider`/`classification` com `$type<…>()`, e `issue_stops` faz o mesmo com `kind`/`resolution`. Copiar o cast junto com o mapeamento propagaria o hábito de esconder exatamente o lugar onde um mismatch real importaria. Os mapeadores NOVOS (`toEntry`, `toStop`) e o `GetNeedsYouPanel` reescrito saem sem cast; `toDomain`/`toPersistence`, que esta frente não precisa tocar, ficam byte-idênticos ao de HEAD.
2. **Tenancy em `GetNeedsYouPanel`** (`UC-P05`). Apertada nomeada (i) do T6 — pré-existente em HEAD, não introduzida aqui.
3. **Redelivery em `RaiseStop`** (`HDL-P06`, `cc-bp-25`). Apertada nomeada (ii) do T6 — pré-existente em HEAD (`DrizzleStopRepository.raise` também era insert seco), e contradizia a promessa do docstring do handler ("os casos sancionados são no-op, not surfaced").

**Falsos positivos, com a razão** (nenhuma ação):

- **A grande maioria — "Cannot verify X"** (`UC-01..05`, `ENT-01..P22`, `REPO-04`, `HDL-04`, `HDL-C01/C02`, `REPO-P18/19/20`, `bp-10`, `UC-P15`, `CMP-01`). É a limitação documentada do próprio `review-plan.ts`: blocos alvo de `Modify` são materializados como snippet PARCIAL, não como arquivo inteiro, e checagens que exigem contexto de arquivo completo (barrel, binding no registry, schema declarado acima do bloco) não têm o que ler. `Issue.ts` acusou 41 fails sobre um bloco que é **um comentário de docstring**.
- **`cc-bp-17` (critical) — "IDs de `StopSchema`/`TranscriptEntrySchema` deveriam ser `z.instance(Id)`".** Contradiz a regra de fronteira de camada do próprio projeto (CLAUDE.md): `z.instance(Id)` só em schema de ENTIDADE e de VALUE OBJECT; eventos, use cases, controllers e DTOs de query ficam com `z.uuid()`/`z.string()`. `TranscriptEntry` e `Stop` são child RECORDS que atravessam para repositório, saída de use case e teste como primitivos — e o próprio `ThreadSchema` usa `z.uuid()` em `ownerId`/`channelId`/`workspaceId` em HEAD, intocado. Adotar `z.instance(Id)` obrigaria construir `Id` em `IngestChannelMessage`, nos mapeadores e em cada teste, para zero invariante nova.
- **`UC-06` / `UC-P04` / `bp-12` / `cc-bp-20` em `GetNeedsYouPanel` e `GetSessionChat`** (`withTransaction`, `tx?`, `DrizzleClient` no use case). São READS. CLAUDE.md define o Query Use Case como exatamente isto — "não passa por entidades, fala direto com Drizzle para montar o DTO que a UI quer" — e nenhum read deste repo (`GetSessionChat`, `GetHomeDashboard`, `GetIssueDetail`) recebe `tx` nem envolve leitura em transação. O classificador roteou por `/usecases/` para a skill `usecase`; a skill `query` é a certa e só reconhece `ui/usecases`.
- **`HDL-P03` / `HDL-P10` — "importe o integration event de `@shared/events`".** Regra desatualizada para o codedm: TODOS os handlers em HEAD importam de `@codedm/contracts-typescript/wire/events` (`MaterializeIssueFromExecution:3`, `DeliverOrchestratorReply:3`, `PublishThreadIntegrationEvents:3`). `shared/events/` é onde o gerador do template emite; aqui os integration events vêm do codegen de contratos. O próprio reviewer hesitou e anotou a inconsistência.
- **`bp-05` — "um handler por evento"** em `MaterializeIssueFromExecution`. A tupla de múltiplos eventos é a forma pré-existente em HEAD, e esta frente REMOVE um dos quatro em vez de acrescentar.
- **`bp-09` — "extraia um `StopCardSchema`"** em `GetNeedsYouPanel`. A forma aparece em UM endpoint só; a regra da casa (skill `controller`) é que o shape de tela única fica local.
- **`REPOI-06` — "mock deveria aceitar `tx`".** Nenhum mock de repositório deste repo aceita `tx` (`MockThreadRepository`, `MockIssueRepository`, `MockConsumedMessageRepository`). Convenção viva.
- **1 arquivo não revisado** (`GetHomeDashboard.ts`) por falha de batch da API, e **5 não classificados** (nenhuma regra casou o caminho): os `.tsp`, o schema Drizzle, o `registry.yaml` das skills. Re-rodável com `bun scripts/review.ts .review-plan-tmp/...`.

