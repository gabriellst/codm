# B4 — fronteiras de agregado: artefato de fechamento

Frente `.plans/2026-07-30-b4-aggregate-boundaries.md` (spec `.specs/2026-07-29-aggregate-boundaries-design.md`).
Medição feita em `333caf17` (T10), antes do commit deste artefato. Este documento só MEDE — nenhuma
linha de código de produção foi alterada por ele.

Commits da frente:

| Task | SHA | Mensagem |
|---|---|---|
| plano | `cfe25861` | docs(plans): B4 — plano da frente aggregate-boundaries |
| T1 | `d6249d20` | feat(thread): B4 — a thread decide quem pode citar o quê e quem precisa de sender |
| T2 | `f87f5452` | feat(thread): B4 — o agregado persiste thread + entries na mesma transacao |
| T3 | `839ee162` | refactor(thread,agent): B4 — TranscriptRepository morre; os 4 writers passam pelo agregado |
| T4 | `06a08366` | feat(db): B4 — a tabela de stops muda de dono no schema e issue_id fica nullable |
| T5+T6 | `6fd77b96` | refactor(thread,issue): B4 T5+T6 — a Stop nasce, morre e e comandada no agregado Thread |
| (merge) | `eae7d3ac` | Merge branch 'feat/rust-wire' into agent-abstraction — sem relação com B4 |
| T7+T8 | `a29be66d` | chore(contracts): B4 — os contratos de stop renomeiam junto com o dono; front re-aponta (T7+T8) |
| T9 | `c621fadd` | refactor(thread,ui): B4 - ThreadStatusDeriver e a morte de shared/services/threadStatus |
| T10 | `333caf17` | docs(skills): B4 — tabela-filha exige justificativa no agregado pai (par TS e Go) |

T5+T6, T7+T8 saíram como commit único cada — decisão do founder documentada nas próprias mensagens
(pre-commit exige `bun tsc` verde nos 7 projetos; separar T5 de T6, ou T7 de T8, exigiria um HEAD
vermelho por design ou `--no-verify`).

---

## (a) Os greps de fechamento — saída VERBATIM

Re-executados em `333caf17` (pós-T10).

### T11.1 — TS: repositórios pelados sobreviventes

```
$ grep -rn "^export abstract class .*Repository {" packages/api/typescript/src
packages/api/typescript/src/agent/repositories/MailboxRepository/MailboxRepository.ts:43:export abstract class MailboxRepository {
packages/api/typescript/src/issue/repositories/TerminalLineRepository/TerminalLineRepository.ts:13:export abstract class TerminalLineRepository {
packages/api/typescript/src/thread/repositories/ConsumedMessageRepository/ConsumedMessageRepository.ts:18:export abstract class ConsumedMessageRepository {
packages/api/typescript/src/thread/repositories/StopPolicyConfigRepository/StopPolicyConfigRepository.ts:26:export abstract class StopPolicyConfigRepository {
```

**Leitura.** Exatamente **4** linhas, como o plano previu (3 + `StopPolicyConfigRepository` "se a
forma dele casar o padrão" — casa). Cada sobrevivente cai num dos dois casos legítimos originais da
regra do T10, ou no terceiro caso que o próprio T10 precisou abrir (ver §(d) abaixo):
`MailboxRepository`/`ConsumedMessageRepository` = infra; `TerminalLineRepository` = tabela-filha
justificada no agregado pai (`Issue.ts:44`); `StopPolicyConfigRepository` = settings row per-owner
GENUINAMENTE sem agregado pai, cuja docstring nomeia a ausência. **AC-11 fechado.**

### T11.1 — TS: TranscriptRepository / StopRepository

```
$ grep -rn "TranscriptRepository\|StopRepository" packages/api/typescript --include="*.ts" | grep -v StopPolicyConfigRepository
packages/api/typescript/tests/flows/agent-session-resume.flow.test.ts:105:	 * `setIssueId` (which died with `TranscriptRepository`), and a CONTACT line carries the sender that
packages/api/typescript/src/thread/repositories/ThreadRepository/DrizzleThreadRepository.ts:52:	 * the whole difference from the `DrizzleTranscriptRepository.append()` this replaces (it minted with
packages/api/typescript/src/thread/repositories/ThreadRepository/DrizzleThreadRepository.ts:219:	 * NO casts, deliberately — `DrizzleTranscriptRepository.toRow` had four and every one was a no-op.
packages/api/typescript/src/thread/repositories/ThreadRepository/ThreadRepository.ts:10: * `TranscriptRepository` is gone: it was a child-table repository with no entity behind it, which is
packages/api/typescript/src/thread/entities/Thread.test.ts:145: * THE FALSIFIER, and it is the reason this Task exists at all: `TranscriptRepository.append()` accepted
packages/api/typescript/src/thread/repositories/ThreadRepository/DrizzleThreadRepository.test.ts:89:	// Migrated verbatim in intent from DrizzleTranscriptRepository.test.ts, which T3 deletes: the DB
packages/api/typescript/src/thread/entities/Thread.ts:38: * the whole point of the change. Before B4 this shape lived on `TranscriptRepository` as
packages/api/typescript/src/thread/entities/Thread.ts:39: * `TranscriptEntryRow` and its id was minted inside `DrizzleTranscriptRepository.append()`, with no
packages/api/typescript/src/thread/entities/Thread.ts:158: * parent. There was no `TranscriptEntry` entity to make it true either; `TranscriptRepository` minted
packages/api/typescript/src/thread/entities/Thread.ts:159: * ids in `DrizzleTranscriptRepository.append()` and inserted whatever it was handed. Now the WRITE goes
packages/api/typescript/src/thread/entities/Thread.ts:165: * A Stop used to hang off `Issue` through a `StopRepository` of its own, with a mandatory `issueId` —
```

**Leitura — desvio do plano registrado.** O plano previa "Expected: vazio (AC-4, AC-8)". A saída real
tem **11 linhas**, mas as 11 são **docblocks/comentários históricos** que explicam o que morreu e por
quê — nenhuma delas é um `import`, uma declaração de classe ou um call site. Nem `TranscriptRepository`
nem `StopRepository` (como classe/arquivo) existem mais em `packages/api/typescript/src`; o grep casa
porque o NOME das classes mortas continua citado em prosa (docstrings de `Thread.ts`, `ThreadRepository.ts`
e nos testes que documentam a migração). Vazio-de-código, não vazio-de-string. **AC-4 e AC-8 fechados**
sob essa leitura — a mesma classe de desvio que o artefato do B3 registrou para o grep de `.publish(`
(comentário vs. call site).

### T11.1 — TS: deriveThreadStatus / shared/services/threadStatus

```
$ grep -rn "deriveThreadStatus\|shared/services/threadStatus" packages/api/typescript --include="*.ts"
packages/api/typescript/src/thread/services/ThreadStatusDeriver/ThreadStatusDeriver.ts:32: * The precedence was already centralized as `shared/services/threadStatus.ts`. What was NOT centralized
packages/api/typescript/src/thread/services/ThreadStatusDeriver/ThreadStatusDeriver.ts:54:	/** The precedence itself, moved verbatim from `shared/services/threadStatus.ts`. */
```

**Leitura.** Mesma classe de desvio: **2 linhas**, ambas docstring do PRÓPRIO `ThreadStatusDeriver.ts`
(T9) citando o caminho antigo para explicar de onde a precedência foi movida. Nem o arquivo
`shared/services/threadStatus.ts` nem a função `deriveThreadStatus` existem mais — `find` confirma
zero arquivo nesse caminho. **AC-12 fechado.**

### T11.1 — TS: integration.issue.stop / IssueStopRaisedEvent / IssueStopResolvedEvent

```
$ grep -rn "integration.issue.stop\|IssueStopRaisedEvent\|IssueStopResolvedEvent" packages/api packages/contracts packages/client packages/app packages/e2e --include="*.ts" --include="*.tsx" --include="*.tsp" --include="*.go" --include="*.json"
packages/api/typescript/src/thread/events/ThreadStopResolvedEvent.ts:9: * Renamed and relocated from `issue/events/IssueStopResolvedEvent` in B4: events live in the context
packages/contracts/generated/go/wire/events.go:945:// BC6 Terminal -> BC4 Thread & Routing. [...] Renamed from integration.issue.stop_raised in B4: the Stop is a child of the THREAD aggregate, and a contract is named after its owner.
packages/contracts/generated/go/wire/events.go:973:// BC4 Thread & Routing -> consumers. [...] Renamed from integration.issue.stop_resolved in B4 along with its owner; [...]
packages/contracts/generated/typescript/src/wire/events/thread-stop-resolved.ts:6:/** [...] Renamed from integration.issue.stop_resolved in B4 [...] */
packages/contracts/generated/typescript/src/wire/events/thread-stop-raised.ts:6:/** [...] Renamed from integration.issue.stop_raised in B4 [...] */
packages/contracts/wire/events/thread-stop-resolved.tsp:5:@doc("[...] Renamed from integration.issue.stop_resolved in B4 [...]")
packages/contracts/wire/events/thread-stop-raised.tsp:5:@doc("[...] Renamed from integration.issue.stop_raised in B4 [...]")
```

(Linhas truncadas com `[...]` neste artefato só onde o `@doc`/docstring é muito longo; o grep real
não trunca nada.)

**Leitura — mesmo padrão.** 7 linhas, TODAS `@doc`/docstring do próprio `.tsp` fonte e dos bindings
gerados (Go + TS) que **documentam o rename** ("Renamed from integration.issue.stop_raised in B4").
Zero identificador `IssueStopRaisedEvent`/`IssueStopResolvedEvent` USADO como tipo, e zero string
`integration.issue.stop_raised`/`_resolved` como `name` de evento — a única ocorrência do padrão de
STRING é dentro da frase que descreve a migração. **AC-15 fechado.**

### T11.1 — TS: import cross-context de StopPolicyConfigRepository

```
$ grep -rn "@issue/repositories/StopPolicyConfigRepository" packages/api/typescript --include="*.ts"
(vazio — exit 1)
```

**AC-16 fechado.**

### T11.2 — Go: diretórios de repositórios

```
$ find packages/api/go/internal/*/repositories -mindepth 1 -type d | sort
packages/api/go/internal/channel/repositories/channel
packages/api/go/internal/channel/repositories/message
packages/api/go/internal/channel/repositories/remote
```

**Leitura.** 3 diretórios, INALTERADOS em relação ao inventário do plano — o B4 não toca repositório
Go, exatamente como previsto.

### T11.2 — Go: issue_stops / thread_stops

```
$ grep -rn "issue_stops\|thread_stops" packages/api/go/ | wc -l
30
```

30 hits — **não** os 22 do inventário original (rodado em HEAD `e6dd28d7`, antes de qualquer Task
desta frente). **Desvio do plano registrado, e explicado, não um erro:** o T4 (`06a08366`) relaxou
`issue_id` para nullable via o recreate-table dance do dialeto sqlite (decisão D-A: DROP+CREATE+RENAME,
não `ALTER COLUMN`), o que criou a migração `0007_high_aaron_stack.sql` — 8 hits NOVOS
(`__new_issue_stops` × várias linhas, todas o dance de recriação). `30 = 22 (baseline) + 8
(migração 0007)`. Confirmado por inspeção do arquivo: `issue_id text` (sem `NOT NULL`) na tabela nova.
**Todos os 30 hits seguem em `core/db/sqlite/`** (DDL derivado + query sqlc + gerados) — nenhum em
`repositories/` Go, nenhum repositório Go de Stop.

```
$ grep -rn "thread_stops" packages/api/go/
(vazio — exit 1)
```

`thread_stops` = **0** — a decisão D-A (não renomear a tabela física) segue valendo. Se este número
não fosse zero, o rename físico teria escapado do escopo da Task 4; não escapou. **AC confirmado.**

### T11.2 — Go: IssueStopRaised / IssueStopResolved

```
$ grep -rn "IssueStopRaised\|IssueStopResolved" packages/api/go/
(vazio — exit 1)
```

**Leitura.** O rename de contrato do T7 não exigiu NENHUMA edição Go à mão — o regen de
`packages/contracts/generated/go/wire/{events,envelope}.go` bastou. **AC-15 (metade Go) fechado.**

---

## (b) Mapa AC → evidência (resultados reais)

| AC | Evidência | Resultado |
|---|---|---|
| AC-1 | `src/thread/entities/Thread.test.ts:"AC-1 FALSEADOR — a citation of an entry from ANOTHER thread is rejected and nothing is accumulated"` (entidade, sem DB) + par vermelho→verde do T1.5 | ✅ pass — ver falseador §(c) |
| AC-2 | `Thread.test.ts:"AC-2 FALSEADOR — CONTACT without a sender is rejected"` + `:"AC-2 FALSEADOR — SYSTEM and WHISPER carrying a contact sender are both rejected"` | ✅ pass |
| AC-3 | `DrizzleThreadRepository.test.ts:"AC-3 — save(thread, tx) persists the thread row AND the accumulated entries"` + `:"AC-3 FALSEADOR — a rolled-back transaction leaves NEITHER a new entry NOR the thread bump"` + `:"AC-3 — the stop and the thread roll back together"` | ✅ pass, 10 testes no arquivo (ver §(e)) |
| AC-4 | grep T11.1 (`TranscriptRepository` só em docblocks — zero classe/import/call site) | ✅ fechado (desvio de contagem documentado em (a)) |
| AC-5 | `src/thread/usecases/{SendDirectMessage,IngestChannelMessage,RecordOrchestratorReply}.test.ts` verdes + o grep acima. **Desvio de escopo do plano, já corrigido no próprio plano (Notes):** o quarto writer é o USE CASE `RecordOrchestratorReply`, não o handler `DeliverOrchestratorReply` — B3 já havia movido o corpo transacional. `SteerThread` não tem `.test.ts` colocado; é coberto por `tests/flows/steer.flow.test.ts` | ✅ pass — ver §(e) |
| AC-6 | `agent/usecases/RunOrchestratorTurn.ts:244` — `this.threads.recentEntries(thread.id.value, this.bufferLimit(thread.bufferSize))`; sem `.test.ts` colocado, coberto por `tests/flows/orchestrator-turn.flow.test.ts` + `tests/flows/issue-result.flow.test.ts` — mesmo limite via `bufferLimit`, mesma ordenação cronológica de `recentEntries` (`DrizzleThreadRepository.test.ts:"recentEntries returns the LAST n, chronological..."`) | ✅ pass |
| AC-7 | `DrizzleThreadRepository.test.ts:"AC-7 — save persists a stop with issue_id NULL, and the read returns it"` e `:"AC-7 — resolveStop stamps resolution + resolvedAt regardless of whether the stop has an issue"` + `Thread.test.ts:"US-5 — a stop with NO issue is raised, and carries the owner + thread from the aggregate"` | ✅ pass |
| AC-8 | grep T11.1 (`StopRepository` só em docblocks) + `thread/usecases/ResolveStop.ts` orquestrando via `ThreadRepository` + métodos do agregado | ✅ fechado |
| AC-9 | `thread/usecases/GetNeedsYouPanel.ts` — `leftJoin` (não `innerJoin`) confirmado por leitura direta do arquivo; `issueId`/`issueKey` opcionais no `OutputSchema`, com docstring citando AC-9 explicitamente | ⚠️ **implementado, SEM teste automatizado** — ver gap registrado em §(f) |
| AC-10 | `DrizzleThreadStatusDeriver.test.ts:"a THREAD-LEVEL stop (no issue) counts too — that is what decision 4 exists for"` — o predicado é `threadId + resolvedAt IS NULL`, nunca dependeu de `issueId`; `GetHomeDashboard.test.ts` e `GetSessionChat.test.ts` sem regressão (878 pass no `bun test` de `packages/api/typescript`) | ✅ pass |
| AC-11 | `.claude/skills/repository/typescript/registry.yaml` (`bp-12`) + `.claude/registry.yaml` (`cc-bp-27`), provado por `bun test:tooling` (414 pass) e por `bun review --backend --context thread` (70 arquivos, zero achado NOVO da regra — ver §(g)); `TerminalLineRepository` e `ConsumedMessageRepository` seguem existindo, cada um num dos casos legítimos | ✅ pass |
| AC-12 | `src/thread/services/ThreadStatusDeriver/` (abstract + `Drizzle*` + `Mock*` + `index.ts`) + `DrizzleThreadStatusDeriver.test.ts` (8 testes) + grep `deriveThreadStatus` vazio-de-código (T9.7) | ✅ pass |
| AC-13 | `GetHomeDashboard.ts:98` — `this.statuses.forOwner(input.ownerId)`; `GetSessionChat.ts:110` — `this.statuses.forThread(input.threadId)`; `DrizzleThreadStatusDeriver.test.ts:"derive is the SAME rule the reads apply — the enricher path cannot drift from the REST path"` | ✅ pass |
| AC-14 | gates completos — ver §(h) | ✅ pass em todos |
| AC-15 | `packages/contracts/wire/events/thread-stop-{raised,resolved}.tsp` — `integration.thread.stop_{raised,resolved}`, `issueId?` nos dois e `threadId` em ambos; `bun check:generated` limpo + greps T11.1/T11.2 vazios-de-código | ✅ pass |
| AC-16 | `thread/repositories/StopPolicyConfigRepository/` + `thread/usecases/RaiseStop.ts:7` importando de `../repositories/StopPolicyConfigRepository`; grep de import cross-context (`@issue/repositories/StopPolicyConfigRepository`) vazio | ✅ pass |
| AC-17 | seção "Inventário" do plano (16 TS + 6 Go, cada um classificado, 0 follow-ups de outros contextos) + `.claude/skills/repository/go/registry.yaml` (`bp-GO-REPO-10`) com os três exemplos Go REAIS + este artefato | ✅ pass |

---

## (c) O falseador do T1 — recordEntry

**Registro do orquestrador (executado na conversa principal, não nesta sessão de fechamento):** com os
guards das três invariantes de `recordEntry` (`QUOTED_ENTRY_NOT_IN_THREAD`, `CONTACT_ENTRY_REQUIRES_SENDER`,
`AGENT_ENTRY_FORBIDS_SENDER`) desligados, `Thread.test.ts` (no estado do arquivo em T1, antes de T5/T6
acrescentarem o describe de `raiseStop`/`resolveStop`) caía para **17 pass / 3 fail** — as 3 falhas
sendo exatamente os três `it(...FALSEADOR...)` que testam essas invariantes. Restaurados os guards:
**20 pass / 0 fail**.

Esses números batem com a aritmética do arquivo atual: a suíte completa de `Thread.test.ts` hoje tem
**27 testes** (13 no describe `Thread entity` original + 7 no describe `recordEntry` do T1 + 7 no
describe `raiseStop / resolveStop` do T5/T6 = 27). Subtraindo os 7 de `raiseStop`/`resolveStop` (que
não existiam ainda quando o T1 foi verificado), sobram exatamente **20** — o número "restaurado" citado
acima. Confirmação independente feita nesta sessão de fechamento:

```
$ cd packages/api/typescript && bun test --preload reflect-metadata src/thread/entities/Thread.test.ts
27 pass
0 fail
```

O arquivo INTEIRO (recordEntry + raiseStop/resolveStop juntos) está verde no HEAD medido — consistente
com "guards restaurados" nos dois falseadores.

## (d) O falseador do lote T5/T6 — raiseStop/resolveStop

**Registro do orquestrador (executado no lote T5/T6, não nesta sessão de fechamento):** com o guard
`STOP_NOT_IN_THREAD` (em `Thread.resolveStop`) comentado, a suíte caía para **26 pass / 1 fail** — a
única falha sendo `it('FALSEADOR — resolving a stop of ANOTHER thread is rejected', ...)`. Restaurado o
guard: **27 pass / 0 fail**.

Esses números também batem com a aritmética: 27 testes no arquivo completo (pós-T5/T6), menos 1 (o
FALSEADOR que exercita especificamente esse guard) = 26. Localização do guard confirmada por leitura
direta:

```
$ grep -n "STOP_NOT_IN_THREAD" packages/api/typescript/src/thread/entities/Thread.ts
372:			throw new BaseError<DomainErrors>('STOP_NOT_IN_THREAD', `stop ${stop.stopId} belongs to thread ${stop.threadId}`)
```

A mesma confirmação independente do §(c) acima (27 pass / 0 fail no arquivo completo) serve como
evidência do estado "restaurado" para os DOIS falseadores — ambos guards estão ativos no HEAD medido.

## (e) Contagem de testes por arquivo (evidência de suporte ao mapa AC)

```
$ grep -c "it(" packages/api/typescript/src/thread/entities/Thread.test.ts
27  (13 create/canInvoke/etc. + 7 recordEntry + 7 raiseStop/resolveStop)

$ grep -n "it(" packages/api/typescript/src/thread/repositories/ThreadRepository/DrizzleThreadRepository.test.ts
10 testes: AC-3 (save+entries), AC-3 FALSEADOR (rollback), múltiplas entries em ordem, todo
TranscriptKind sobrevive ao CHECK, recentEntries+findEntry, findById não hidrata histórico,
AC-7 (stop com issue_id NULL), AC-7 (resolveStop sem issue), AC-3 (stop+thread roll back together)
```

## (f) Gap encontrado nesta medição — AC-9 sem teste automatizado

`GetNeedsYouPanel.ts` está estruturalmente correto (`leftJoin`, `issueId`/`issueKey` opcionais,
tenancy corrigida) e a docstring do arquivo cita AC-9 explicitamente. **Mas não existe nenhum
`.test.ts` que exercite esse use case, nem colocado nem em `tests/flows/`** —
`grep -rln "GetNeedsYouPanel" packages/api/typescript --include="*.test.ts"` retorna vazio. O plano
(Final Validation) atribuía a prova a `tests/flows/stop-control-plane.flow.test.ts`, mas esse arquivo
não referencia `GetNeedsYouPanel`/`NeedsYouPanel` em lugar nenhum — os 3 testes ali cobrem
raise→resolve e a policy desabilitada, não a leitura do painel. Esta é uma pendência real, descoberta
nesta medição, e **fora do scope fence do T11** (só mede, não escreve código): fica registrada aqui
como gap para o founder decidir — cobrir com um teste de flow ou aceitar a cobertura estrutural como
suficiente dado que o `leftJoin` é a única mudança de comportamento e o resto do use case é
pré-existente.

## (g) O gate `bun review --backend --context thread` — achado e correção durante o T10

Rodar o gate do T10.5 pela primeira vez (70 arquivos do contexto `thread`, scan `--all`) produziu **um
falso positivo real**: `StopPolicyConfigRepository.ts`/`DrizzleStopPolicyConfigRepository.ts` foram
marcados `bp-12:F`/`cc-bp-27:F` — a regra recém-escrita não previa o caso de uma settings row
GENUINAMENTE sem agregado pai (a policy é per-owner, não há instância de `Thread` para hospedar a
justificativa). Investigação encontrou a causa raiz: `scripts/review.ts` (`renderCompactChecklistSection`,
`normalizeSummaryText`) **trunca os campos `wrong`/`right`/`always_flag_when` em 180 caracteres** no
prompt compacto enviado ao agente revisor — o texto original só descrevia DOIS casos legítimos
(infra / child-de-agregado-justificado-no-pai) nos primeiros ~180 caracteres, cortando antes de chegar
ao terceiro caso. Corrigido reordenando `wrong`/`right` em `bp-12` (repository/typescript) e
`always_flag_when`/`right` em `cc-bp-27` (cross-cutting) para que a exceção do caso 3 apareça nas
primeiras ~170 chars, seguida do conteúdo completo (preservado para o `/review` interativo e para
leitores humanos do registry). Reverificado arquivo-a-arquivo até `bp-12`/`cc-bp-27` passarem limpos
nos dois arquivos de `StopPolicyConfigRepository`, depois reconfirmado no scan completo de 70 arquivos
— **zero achado novo das duas regras** (o único `bp-12:F` do scan completo é em `Thread.ts`, e é a
regra HOMÔNIMA-MAS-DIFERENTE do skill `entity` — "Raw schemas for composite VOs instead of
z.instance(VO)" —, débito pré-existente não relacionado a esta frente).

## (h) Gates — saída real

| Gate | Comando | Exit | Saída |
|---|---|---|---|
| tsc (api-ts) | `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` | **0** | limpo, sem output |
| test (api-ts) | `cd packages/api/typescript && bun test` | **0** | `878 pass / 3 skip / 0 fail`, 2116 expect() calls, 881 testes em 138 arquivos |
| tsc (monorepo) | `bun tsc` | **0** | `NX Successfully ran target tsc for 7 projects` |
| test:tooling | `bun run test:tooling` | **0** | `414 pass / 0 fail`, 1067 expect() calls, 414 testes em 26 arquivos |
| check:generated | `bun check:generated` | **0** | `✓ generated output in sync (contracts bindings, SDK dist, openapi.json)` — `git status` confirma zero drift |
| contracts codegen | `cd packages/contracts && bun test codegen/` | **0** | `92 pass / 0 fail`, 392 expect() calls, 92 testes em 9 arquivos |
| Go build | `cd packages/api/go && go build ./...` | **0** | limpo, sem output |
| Go test | `cd packages/api/go && go test ./...` | **0** | todos os pacotes `ok` (cached) ou `[no test files]`; `pkg/openapi` 3.18s |
| dump-sqlite-schema | `cd packages/api/typescript && bun scripts/dump-sqlite-schema.ts --check` | **0** | `✔ schema.sql matches the migrations` |
| e2e | `cd packages/e2e && bun run test` | **0** | `6 passed / 2 skipped` — `08-stop-resolve.spec.ts` (`test.skip`, sem caminho hermético para levantar stop) e `09-sse-pill.spec.ts` (frames `browser.*` do B5, não tocados) |
| app-react tsc | `cd packages/app/react && bun x tsc` | **0** | limpo, sem output |
| lint | `bun lint` | **0** | `NX Successfully ran target lint for 3 projects` |
| review (T10.5) | `bun review --backend --context thread` | **0** | 70 arquivos, zero achado novo de `bp-12`/`cc-bp-27` — ver §(g) |

Bônus (não pedidos explicitamente, rodados por completude):

| Gate | Comando | Exit | Saída |
|---|---|---|---|
| db:check-go | `bun run --cwd packages/contracts db:check-go` | **0** | `✔ packages/api/go/core/db/sqlite/migrations is byte-identical to the contracts source` |

---

## (i) Inventário completo — TS (16 repositórios, reclassificação final)

| # | Ctx | Repositório | Entidade? | Classificação final (pós-B4) |
|---|---|---|---|---|
| 1 | agent | `AgentSessionRepository` | ✅ | JUSTIFICADO-AGREGADO |
| 2 | agent | `MailboxRepository` | ❌ | JUSTIFICADO-INFRA (fila durável, lease/dedup/poison) |
| 3 | artifact | `ArtifactRepository` | ✅ | JUSTIFICADO-AGREGADO |
| 4 | auth | `AccountRepository` | ✅ | JUSTIFICADO-AGREGADO |
| 5 | auth | `UserRepository` | ✅ | JUSTIFICADO-AGREGADO |
| 6 | auth | `UserProfileRepository` | ✅ | JUSTIFICADO-AGREGADO |
| 7 | issue | `IssueRepository` | ✅ | JUSTIFICADO-AGREGADO |
| 8 | issue | ~~`StopRepository`~~ | — | **ELIMINADO (T5/T6)** — Stop virou child de `Thread` |
| 9 | thread | `StopPolicyConfigRepository` | ❌ | **CORRIGIDO (T5/T6 + T10)** — migrou para `thread/`; caso 3 (settings row sem pai, docstring nomeia a ausência) |
| 10 | issue | `TerminalLineRepository` | ❌ | JUSTIFICADO-DOCUMENTADO — `Issue.ts:44`, inalterado (exceto a correção redacional do T10) |
| 11 | owner | `OwnerRepository` | ✅ | JUSTIFICADO-AGREGADO |
| 12 | thread | `ThreadRepository` | ✅ | JUSTIFICADO-AGREGADO — agora superfície de leitura+escrita do agregado (entries + stops) |
| 13 | thread | ~~`TranscriptRepository`~~ | — | **ELIMINADO (T3)** — absorvido por `Thread`/`ThreadRepository` |
| 14 | thread | `ConsumedMessageRepository` | ❌ | JUSTIFICADO-INFRA (latch exactly-once) |
| 15 | workspace | `WorkspaceRepository` | ✅ | JUSTIFICADO-AGREGADO |
| 16 | core | `DomainEventRepository` | n/a | JUSTIFICADO-INFRA |

**Contagem final: 14 repositórios (16 do inventário original − 2 eliminados). 3 VIOLA do inventário
original, todos corrigidos: `StopRepository` eliminado, `TranscriptRepository` eliminado,
`StopPolicyConfigRepository` corrigido de endereço.** Zero follow-ups em outros contextos.

## (j) Inventário completo — Go (6 repositórios, zero violações, inalterado)

Idêntico ao inventário do plano — o B4 não toca nenhum repositório Go. Os três exemplos REAIS
(`SqliteChannelRepository`, o par agregado/projeção de `gateway_remotes`, e
`gateway_remote_memberships`) alimentaram `bp-GO-REPO-10` no T10.

---

## (k) Observações O1–O6 das Notes — pendências de decisão do founder

Nenhuma virou Task nesta frente; nenhuma foi tocada por T10/T11 (fora do scope fence).

- **O1 (dúvida genuína ao founder).** A spec era silenciosa sobre a LOCALIZAÇÃO de
  `RaiseStop`/`ResolveStop`/`GetNeedsYouPanel`/`UpdateStopCriteriaConfig`. O plano os migrou para
  `thread/` (T6) por `docs/BACKEND.md:170/173`. Confirmado nesta medição: os 4 use cases + os 3
  controllers vivem em `thread/`, nenhum path HTTP mudou. **Ainda pendente:** confirmação explícita do
  founder de que essa leitura de `docs/BACKEND.md` é a desejada (vs. um desvio aceito).
- **O2 (observação, não virou Task).** `GetIssueDetail` (`issue/usecases/`) continua filtrando `stops`
  por `issueId` — comportamento esperado, não migra.
- **O3 (observação, não virou Task).** `AskOperatorInputSchema.issueId` e
  `AgentRunStopRaisedEventSchema.issueId` continuam OBRIGATÓRIOS — B2 relaxa, não B4.
- **O4 (observação, não virou Task).** `Thread.setStatus` continua sem call site — candidato a
  remoção junto da coluna `threads.status`, mas é migração destrutiva. Decisão do founder.
- **O5 (observação, lado Go, entrou na skill como advertência).** O contrato de colunas disjuntas de
  `gateway_remotes` é honrado pelo agregado e quebrado pelo `Save` largo da projeção (6 colunas
  reclamadas no `ON CONFLICT DO UPDATE`). Registrado em `bp-GO-REPO-10`; corrigir o código é fora do
  escopo desta frente.
- **O6 (observação, lado Go).** 4 writers de `gateway_remote_memberships` gerados por sqlc têm zero
  chamadores (dead code de codegen). Não tocado.
- **Follow-ups de CLI** (`bun cli service --seam`, sufixo de `bun cli handler`) e **follow-up de
  migração** (rename físico `issue_stops` → `thread_stops`, numa frente própria) — nenhum dos dois
  tocado por T10/T11, ambos permanecem registrados no plano.

---

## Desvios do plano registrados

1. **Contagens de grep previstas como "vazio" que na verdade retornam docblocks históricos** — greps
   de `TranscriptRepository`/`StopRepository` (11 linhas) e `deriveThreadStatus`/`shared/services/threadStatus`
   (2 linhas) e o grep de `integration.issue.stop*` (7 linhas). Todas são comentário/docstring
   explicando a migração, não código vivo. Mesma classe de desvio que o artefato do B3 já havia
   registrado para o grep de `.publish(`.
2. **Contagem de `issue_stops`/`thread_stops` no Go: 30, não 22.** O baseline de 22 foi medido ANTES
   do T4 aplicar a migração `0007_high_aaron_stack.sql` (recreate-table dance para relaxar `issue_id`
   para nullable). Os 8 hits extras são exatamente essa migração nova — esperado, não um escape de
   escopo (confirmado: `thread_stops` continua zero).
3. **AC-9 sem teste automatizado** — gap real encontrado durante a medição do T11, não coberto por
   nenhuma Task deste plano. Ver §(f).
4. **`bp-12`/`cc-bp-27` precisaram de uma segunda iteração dentro do próprio T10** — o gate
   `bun review --backend --context thread` acusou `StopPolicyConfigRepository` como falso positivo na
   primeira tentativa, por causa da truncagem de 180 caracteres do `compact-prompt` de `review.ts`. A
   regra foi corrigida (terceiro caso legítimo + reordenação para sobreviver à truncagem) DENTRO do
   T10, antes do commit — não ficou como pendência. Ver §(g).
5. **`SteerThread` e `RunOrchestratorTurn` não têm `.test.ts` colocado** — o Final Validation do plano
   cita esses caminhos; a cobertura real está em `tests/flows/steer.flow.test.ts` e
   `tests/flows/{orchestrator-turn,issue-result}.flow.test.ts`. Comportamento coberto, caminho de
   arquivo diferente do previsto.
