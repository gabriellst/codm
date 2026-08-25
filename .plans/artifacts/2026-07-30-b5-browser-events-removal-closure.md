# B5 — remoção de `browser.*` + `BrowserFrameEnricher`: artefato de fechamento

Frente `.plans/2026-07-30-b5-browser-events-removal.md` (spec `.specs/2026-07-29-browser-events-removal-design.md`).
Medição feita em `7cb7a907` (T4), antes do commit deste artefato. Este documento só MEDE — nenhuma
linha de código de produção foi alterada por ele.

Commits da frente:

| Task | SHA | Mensagem |
|---|---|---|
| T1 | `e76cf055` | feat(contracts,thread): B5 T1 — integration.thread.message_ingested nasce |
| T2+T3 | `a1ed0fb6` | refactor(ui,app-react): B5 T2+T3 — BrowserFrameEnricher morre, front re-aponta para os crus |
| T4 | `7cb7a907` | test(thread): B5 T4 — GetNeedsYouPanel prova o leftJoin do B4 AC-9 |

**T2+T3 saíram como commit único** — mesma classe de decisão que o B4 já registrou para T5+T6/T7+T8:
o pre-commit hook roda `bun run tsc` (`nx run-many -t tsc`, cobre os 7 projetos incluindo `app-react`).
T2 sozinho remove os 3 arms `browser.*` do contrato de saída do `ListenEventsController`; até T3
re-apontar `THREAD_REALTIME_EVENTS`/`AgentsRunningPill`/`HomeDashboard` para os nomes crus, `app-react`
fica vermelho no `tsc` — um commit só-T2 reprovaria o próprio pre-commit hook (invariante do repo: todo
snapshot commitado verde). Verificado ao vivo: `cd packages/app/react && bun x tsc --noEmit` com T2
aplicado e T3 não aplicado produzia 11 erros `TS2345`/`TS2322`/`TS2678`/`TS2339` nos 3 arquivos que T3
reaponta — anotado abaixo em (e).

---

## (a) Os greps de fechamento — saída VERBATIM

Re-executados em `7cb7a907` (pós-T4).

### T5.1 — `browser.` em `packages/api/typescript/src`

```
$ grep -rn "browser\." packages/api/typescript/src
packages/api/typescript/src/ui/controllers/ListenEvents.ts:26: * the frontend `useServerEvents` hook. ONE surface (B5: the enriched `browser.*` frames — and the
packages/api/typescript/src/ui/controllers/ListenEvents.ts:101:	 * `BrowserFrameEnricher` that used to synthesize an ADDITIVE `browser.*` frame per fact is gone
packages/api/typescript/src/agent/controllers/StreamTerminalSession.ts:24: * output frame the running session pushes (`AgentStreamRegistry.send`) straight to the browser.
packages/api/typescript/src/agent/controllers/StreamTerminalSession.ts:38:	readonly description = 'Live terminal output for an issue session via Server-Sent Events (browser.terminal_output_appended)'
packages/api/typescript/src/agent/services/TerminalOutputAccumulator/TerminalOutputAccumulator.ts:93:	 * `browser.terminal_action_detected` was keyed on the nine-member TUI action enum (the output of the
packages/api/typescript/src/agent/services/TerminalOutputAccumulator/TerminalOutputAccumulator.ts:106:			name: 'browser.terminal_output_appended',
packages/api/typescript/src/agent/services/TerminalOutputAccumulator/TerminalOutputAccumulator.ts:119:				return { name: 'browser.terminal_action_detected', issueId: this.ctx.issueId, tool: frame.tool, input: summarize(frame.input), at }
packages/api/typescript/src/agent/services/TerminalOutputAccumulator/TerminalOutputAccumulator.test.ts: (3 hits, same family)
packages/api/typescript/src/agent/services/AgentStreamRegistry/AgentStreamRegistry.test.ts: (2 hits, same family)
packages/api/typescript/src/agent/services/AgentStreamRegistry/AgentStreamRegistry.ts: (4 hits, same family)
packages/api/typescript/src/external/controllers/ChannelProxy.ts:19: * SSE `/events` stream all ride the api-ts origin — no gateway CORS, no identity in the browser.
packages/api/typescript/src/thread/handlers/PublishThreadIntegrationEvents.ts:28: * JOIN. That JOIN used to live in `BrowserFrameEnricher.threadIdForContact` (`browser.thread_message_ingested`),
```

**Leitura — desvio do plano registrado, mesma classe que o B4 já catalogou (`TranscriptRepository`/
`StopRepository`, artefato B4 §(a)).** O plano previa "só hits de `browser.terminal_output_appended` /
`browser.terminal_action_detected`". A saída real tem hits adicionais em 3 famílias:

1. **`AgentStreamRegistry`/`TerminalOutputAccumulator`/`StreamTerminalSession`** — exatamente a família
   fora de escopo que a spec já nomeia (`browser.terminal_action_detected` E
   `browser.terminal_output_appended`, os DOIS sobreviventes previstos pela Nota do plano). Confere.
2. **`ChannelProxy.ts:19`** — falso-positivo de regex: "identity in the browser." é o fim de uma frase
   em inglês, sem relação com nenhum nome de evento. Pré-existente, não tocado por nenhuma Task B5.
3. **`ListenEvents.ts` (T2) e `PublishThreadIntegrationEvents.ts` (T1)** — código-fonte VAZIO, string
   NÃO-vazia: os dois hits são prosa histórica ("...the enriched `browser.*` frames...are gone", "...that
   JOIN used to live in `BrowserFrameEnricher.threadIdForContact`...") copiada VERBATIM do bloco
   "COMPLETE final file" que o próprio plano especifica para essas duas Tasks (T1 Step T1.5, T2 Step
   T2.1). Nenhum `import`, nenhuma declaração, nenhum call site — o nome sobrevive em comentário
   explicando por que a classe morreu, o padrão que o B4 chamou de "vazio-de-código, não vazio-de-string"
   (mesma leitura aplicada lá a `TranscriptRepository`/`StopRepository`).

**AC-5 fechado sob essa leitura.** Nenhum código de produção referencia `browser.*`/`BrowserFrameEnricher`
fora da família terminal (fora de escopo) e da prosa histórica que o próprio plano ditou verbatim.

### T5.1 — `browser.` em `packages/app/react/src`

```
$ grep -rn "browser\." packages/app/react/src
packages/app/react/src/components/console/AgentsRunningPill.tsx:12: * Direct wire events since B5 — the synthesized `browser.thread_status_changed`
packages/app/react/src/hooks/useTerminalStream.ts:11:export type TerminalActionFrame = Extract<TerminalStreamFrame, { name: 'browser.terminal_action_detected' }>
packages/app/react/src/hooks/useTerminalStream.ts:32: * are rendered and forgotten by the browser. The daemon admits exactly one observer per issue, which
packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx:118: * `browser.terminal_action_detected` carrying the CLI's REAL tool name plus a one-line input summary,
packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx:171:	if (frame.name === 'browser.terminal_action_detected') {
packages/app/react/src/routes/(app)/threads/$threadId/-components/NeedsYouPanel/index.tsx:27:	// enriched `browser.*` frame, no server-side status recompute standing in for either direction.
packages/app/react/src/routes/(app)/threads/$threadId/-hooks/useThreadRealtime.ts: (3 hits — prose)
packages/app/react/src/routes/(app)/threads/$threadId/-hooks/useThreadRealtime.test.tsx: (2 hits — prose)
```

**Leitura.** O plano previa "só `useTerminalStream.ts` e `IssueDetailSection/index.tsx`" (a família
`terminal_action_detected`, fora de escopo). Confere para esses dois arquivos — mais um falso-positivo
de regex idêntico ao de `ChannelProxy.ts` (`useTerminalStream.ts:32`, "forgotten by the browser." é fim
de frase). Os hits ADICIONAIS em `AgentsRunningPill.tsx`, `NeedsYouPanel/index.tsx`,
`useThreadRealtime.ts`/`.test.tsx` são, de novo, prosa histórica copiada verbatim do bloco "COMPLETE
final file"/diff que o plano especifica para T3 (Steps T3.1–T3.3, T3.5) — mesma classe de desvio.
Código-fonte vazio, string não-vazia.

### T5.1 — `BrowserFrameEnricher`/`BrowserSseFrameSchema` em `packages/api/typescript`

```
$ grep -rn "BrowserFrameEnricher\|BrowserSseFrameSchema" packages/api/typescript --include="*.ts" | grep -v "/dist/"
packages/api/typescript/tests/flows/inbound-routing.flow.test.ts:25: * row and the raw facts reach the console via the SSE re-emit (B5: `BrowserFrameEnricher` is gone).
packages/api/typescript/src/ui/controllers/ListenEvents.ts:27: * `BrowserFrameEnricher` that synthesized them — are gone; the broadcaster re-emits the raw envelope
packages/api/typescript/src/ui/controllers/ListenEvents.ts:101:	 * `BrowserFrameEnricher` that used to synthesize an ADDITIVE `browser.*` frame per fact is gone
packages/api/typescript/src/thread/handlers/PublishThreadIntegrationEvents.ts:28: * JOIN. That JOIN used to live in `BrowserFrameEnricher.threadIdForContact` (`browser.thread_message_ingested`),
packages/api/typescript/src/thread/handlers/PublishThreadIntegrationEvents.test.ts:15: * thread without a server-side join (`BrowserFrameEnricher.threadIdForContact`, removed by this same
```

5 hits, todos prosa histórica dentro de arquivos cujo conteúdo COMPLETO o plano especifica verbatim
(T1: `PublishThreadIntegrationEvents.ts`/`.test.ts`; T2: `ListenEvents.ts`, o comentário de
`inbound-routing.flow.test.ts`). `git check-ignore -v packages/api/typescript/dist/server.js` confirma
`dist/` gitignorado (`.gitignore:37`) — o grep sem `--include`/`grep -v dist` também bate no bundle
local stale do `bun run build` do pre-commit hook anterior; irrelevante ao estado do repo. **AC-5/AC-6
fechados** sob a mesma leitura "vazio-de-código".

Nenhum hit nos 4 arquivos que T2 corrigiu mecanicamente (ver §(f)) — `context-map.ts`,
`DeclareIssueComplete.ts`, `RecordStopFromExecution.ts`, `ThreadStatusDeriver.ts` — confirmando que o
ajuste mecânico funcionou para os arquivos fora do escopo declarado das Tasks.

### T5.1 — `integration.thread.message_ingested` em `api/src`, `app/react/src`, `contracts/generated`

```
$ grep -rln "integration.thread.message_ingested" packages/api/typescript/src packages/app/react/src packages/contracts/generated
packages/api/typescript/src/thread/handlers/PublishThreadIntegrationEvents.ts
packages/api/typescript/src/thread/handlers/PublishThreadIntegrationEvents.test.ts
packages/app/react/src/routes/(app)/threads/$threadId/-hooks/useThreadRealtime.ts
packages/app/react/src/routes/(app)/threads/$threadId/-hooks/useThreadRealtime.test.tsx
packages/contracts/generated/go/wire/events.go
packages/contracts/generated/go/wire/envelope.go
packages/contracts/generated/typescript/src/wire/events/thread-message-ingested.ts
packages/contracts/generated/rust/src/wire/events.rs
packages/contracts/generated/rust/src/wire/envelope.rs
```

Não-vazio nos três roots — inclusive Rust (o pipeline `bun contracts`/`bun sdk` gera TS+Go+Rust; o
plano cita só "TS + Go" na Step T1.4 mas o `codegen:wire` real emite os três). **AC-1, AC-3, AC-8
fechados.**

### T5.1 — `browser.thread_status_changed|browser.stop_raised|browser.thread_message_ingested` em `packages/api packages/app packages/client packages/e2e`

```
$ grep -rn "browser\.thread_status_changed\|browser\.stop_raised\|browser\.thread_message_ingested" packages/api packages/app packages/client packages/e2e | grep -v "/dist/\|/node_modules/"
packages/api/typescript/src/thread/handlers/PublishThreadIntegrationEvents.ts:28: (prosa histórica, T1)
packages/app/react/CLAUDE.md:226: the enricher resolves it to `browser.thread_message_ingested { threadId }`. A fact that
packages/app/react/CLAUDE.md:234: `browser.thread_status_changed`, and a new message changes no status — so it never updated and
packages/app/react/src/components/console/AgentsRunningPill.tsx:12: (prosa histórica, T3)
packages/app/react/src/routes/(app)/threads/$threadId/-hooks/useThreadRealtime.ts:21,22: (prosa histórica, T3)
packages/app/react/src/routes/(app)/threads/$threadId/-hooks/useThreadRealtime.test.tsx:19: (prosa histórica, T3)
```

**AC-11 — ACHADO REAL, fora da classe "vazio-de-código" acima.** `packages/app/react/CLAUDE.md` (doc
de arquitetura do workspace, lida por toda sessão futura) descreve `BrowserFrameEnricher` como padrão
ATIVO, não histórico — a bullet "A `browser.*` frame is added to `BrowserFrameEnricher` ONLY when the
browser cannot scope the raw fact by itself" é uma INSTRUÇÃO prescritiva para o próximo engenheiro,
apontando para uma classe que este plano apagou (T2). Diferente de todos os outros hits desta seção
(prosa "isso morreu, aqui está por quê"), essa bullet ensinaria alguém a recriar o padrão removido.

**Nenhuma Task deste plano declara `packages/app/react/CLAUDE.md` como arquivo a escrever.** A classe
pré-autorizada herdada para desvio mecânico sem pedir permissão é estritamente "fixture do
create-template defasado contra package.json committado" — não cobre documentação de arquitetura.
Corrigir essas duas bullets exigiria decidir COMO descrever a política atual (quando um
`useServerEvents` novo precisa de nome cru vs. quando algo do lado do servidor ainda precisaria de
enriquecimento — uma decisão de conteúdo, não um s/nome-antigo/nome-novo/ mecânico). **Não corrigido
por este plano — registrado aqui como achado que exige decisão do founder**, mesmo padrão de "PARE e
reporte" que as Notes deste plano já usam para outras pendências (ex.: a nota final sobre
`.specs/2026-07-30-rust-wire-and-tauri-sdk-design.md`).

---

## (b) Tabela AC-1..AC-11 → evidência

| AC | Evidência |
|---|---|
| AC-1 | `packages/contracts/wire/events/thread-message-ingested.tsp` (T1) — `ThreadMessageIngestedEvent extends IntegrationEvent`, `name: "integration.thread.message_ingested"`, `threadId: string` |
| AC-2 | **já satisfeito em HEAD** (G-A do plano) — `packages/contracts/wire/events/thread-stop-resolved.tsp` (renomeado pelo B4 T7), `threadId: string` não-opcional. Confirmado por leitura direta antes de T1. |
| AC-3 | `packages/api/typescript/src/thread/handlers/PublishThreadIntegrationEvents.test.ts` — `'AC-3 — an inbound message publishes integration.thread.message_ingested with the SAME threadId, no lookup'` — RED confirmado (Step T1.2: `getPublishedOfType(...)` retornava `[]`) antes de GREEN (T1) |
| AC-4 | **já satisfeito em HEAD** (G-B do plano) — `packages/api/typescript/tests/flows/stop-control-plane.flow.test.ts:"AC-7 — a THREAD-LEVEL stop..."`, `payload).toMatchObject({ stopId, threadId: thread.id.value })` no evento publicado. Não tocado por nenhuma Task. |
| AC-5 | Step T2.6 (grep `BrowserFrameEnricher` — só prosa histórica) + §(a) acima — arquivo/classe deletados (`git rm -r ui/services`), zero import/call-site sobrevivente |
| AC-6 | `packages/api/typescript/src/ui/controllers/ListenEvents.ts` (T2) — `ListenEventsControllerOutputSchema = z.discriminatedUnion('name', [...materializedIntegrationEventSchemas])`, sem `BrowserSseFrameSchema` |
| AC-7 | `packages/api/typescript/src/ui/controllers/ListenEvents.ts` (T2) — `ensureBroadcaster` sem `enricher`/`enrich`, só `rawFrame` |
| AC-8 | `packages/app/react/src/routes/(app)/threads/$threadId/-hooks/useThreadRealtime.ts:THREAD_REALTIME_EVENTS` (T3, 9 nomes) + `useThreadRealtime.test.tsx:"every subscribed frame stales something — no dead subscriptions"` (10/10 pass) |
| AC-9 | `packages/app/react/src/components/console/AgentsRunningPill.tsx` + `HomeDashboard/index.tsx` (T3) — os 4 nomes crus (`issue.opened/completed`, `thread.stop_raised/stop_resolved`), sem `browser.*` |
| AC-10 | `bun sdk` nos gates de T1/T2 (com `--skip-nx-cache` forçado — ver §(e)) + `cd packages/api/typescript && bun x tsc` + `cd packages/app/react && bun x tsc` verificados em cada Task, e novamente no gate agregado T5.3 |
| AC-11 | Step T5.1 último grep — vazio de CÓDIGO nos 4 roots citados pelo plano (`packages/api`, `packages/app/src`, `packages/client`, `packages/e2e`), mas **NÃO vazio em `packages/app/react/CLAUDE.md`** (achado real, não corrigido — ver §(a) última seção) |

**Duas lacunas de `threadId` das 4 que a spec original listava já estavam fechadas em HEAD (AC-2,
AC-4) — nenhuma Task de código as reabriu.**

---

## (c) Os 8 gates completos — saída

Todos re-executados em `7cb7a907` (T4), com `--skip-nx-cache` onde a rodada normal bateu cache para
descartar a possibilidade de staleness (ver §(e)).

```
$ bun x nx run-many -t tsc --skip-nx-cache
Result (30 files): 0 errors, 0 warnings, 0 hints   [app-astro]
Successfully ran target tsc for 7 projects          [api-typescript, e2e, app-react, app-astro, api-go, contracts x2]
```
**PASS** — 7/7 projetos, forçado fresh (não-cache).

```
$ bun lint
> nx run app-react:lint  →  eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0
Successfully ran target lint for 3 projects
```
**PASS** — `app-react` rodou fresh (não-cache); `app-styles`/`app-astro` cache hit, legítimo (nenhum
arquivo dessas duas árvores mudou nesta frente).

```
$ bun run test
Ran 168 tests across 26 files.   [root TS suites]
Ran 92 tests across 9 files.     [contracts codegen]
Ran 877 tests across 139 files.  [api-typescript]   (874 antes de T4, +2 do GetNeedsYouPanel.test.ts, +1 residual)
Ran 32 tests across 6 files.     [app-react]
cargo test (rust): 8 total, ok
go test ./... (contracts-go + api-go): ok, 0 failed
Successfully ran target test for 6 projects
```
**PASS** — 0 fail em todos os 6 projetos nx + Rust + Go.

```
$ bun detect
33 finding(s), 33 gating   — component-props (CP-01/CP-02, bp-20)
3 finding(s), 3 gating     — projection-shape (GPS-03, Go channel projectors)
2 finding(s), 2 gating     — go-enum-literals (GEL-01, whatsmeow_channel.go)
detect: 6/6 detector(s) reported findings
error: script "detect" exited with code 1
```
**FALHA, mas achado PRÉ-EXISTENTE — não introduzido por B5.** `git diff --name-only a471d168..HEAD`
(a lista completa dos 35 arquivos tocados pelas 3 Tasks de código) tem interseção ZERO com os 38
arquivos que `bun detect` aponta (`ThreadAvatar.tsx`, `ChannelsSection`, `HomeSection`,
`SetupChecklist`, `IssuesOverviewSection`, `GeneralSection`, `ProvidersSection`, `SettingsSection`,
`StopCriteriaSection`, `ArtifactsSection`, `Composer`, `IssueDetailSection`, `SessionChatSection`,
`SessionHeader`, `SessionIssuesSection`, `TranscriptBubble`, `WorkspacesSection`,
`AttachThreadWizard`, `StepHeading`, `ControlSlide`, `HowItWorksSlide`, `OnboardingFlow`,
`ValueSlide`, mais 3 arquivos de projectors Go do contexto `channel` e 2 literais de enum Go em
`whatsmeow_channel.go`). Backlog pré-existente do repo (component `ComponentProps` extension, Go
projection free-record shape, Go enum-literal discipline) — nenhum tocado por nenhuma das 3 Tasks de
código desta frente. **Não corrigido** — corrigir 23+ componentes e 5 arquivos Go não relacionados é
escopo muito além de "remoção de `browser.*`", proibido pela disciplina anti-invenção do plano
("Scope discipline" do CLAUDE.md). Registrado para decisão do founder, mesmo tratamento do achado do
CLAUDE.md em §(a).

```
$ bun check:generated
✓ generated output in sync (contracts bindings, SDK dist, openapi.json)
```
**PASS.**

```
$ bun test:tooling
414 pass
0 fail
Ran 414 tests across 26 files.
```
**PASS.**

```
$ cd packages/api/go && go build ./... && go test ./...
(build: sem output = sucesso)
ok  	template/api-go/pkg/openapi	3.293s
(todos os demais pacotes: ok ou "no test files")
```
**PASS.**

```
$ cd packages/e2e && bun run test
  ✓ 10-terminal-tool-frame.spec.ts › the console panel receives the REAL tool name on the re-keyed SSE action frame (6.1s)
  2 skipped
  6 passed (14.8s)
```
**PASS** — 6 passed, 0 failed. Os 2 skipped são `test.skip(true, ...)` PRÉ-EXISTENTES e não
relacionados a B5:
- `08-stop-resolve.spec.ts:21` — `'No hermetic stop-raising path: the e2e stub AgentRunner never emits an approval/auth stop (exit 0 only).'`
- `09-sse-pill.spec.ts:21` — `'Stub session completes synchronously (exit 0) — no stable "running" window to observe on the SSE-driven pill.'`

Nenhum dos dois arquivos aparece em `git diff --name-only a471d168..HEAD` — limitação de infra do stub
`AgentRunner` do e2e, não uma regressão desta frente.

**Resultado agregado: 7/8 gates verdes; 1 (`bun detect`) com achados 100% pré-existentes e sem
interseção com o diff desta frente — tratado como PASS para fins de fechamento de B5, achados
registrados para decisão do founder fora deste plano.**

---

## (d) Os falseadores provados (T4.2)

```
$ cd packages/api/typescript && bun test src/thread/usecases/GetNeedsYouPanel.test.ts   # leftJoin (código real)
2 pass
0 fail
Ran 2 tests across 1 file.
```

```
$ # GetNeedsYouPanel.ts: .leftJoin(issues, ...) trocado por .innerJoin(issues, ...) temporariamente
$ cd packages/api/typescript && bun test src/thread/usecases/GetNeedsYouPanel.test.ts   # innerJoin (falseador)
✗ FALSIFIER — a stop with NO issueId is listed, with issueId/issueKey UNDEFINED (not dropped by the leftJoin)
  Expected length: 1
  Received length: 0
1 pass
1 fail
Ran 2 tests across 1 file.
```

Confirmado: o `FALSIFIER` cai para vermelho (o `panel.stops` some quando não há `issueId`), o segundo
caso (`a stop WITH an issue...`) permanece verde — exatamente a assimetria que a Task previu. Revertido
para `.leftJoin` imediatamente após; `git diff --stat` em `GetNeedsYouPanel.ts` confirmou zero diff
residual antes do commit T4 (o Task não toca o arquivo de produção).

---

## (e) A armadilha de cache do nx descoberta em T1/T2

`bun emit-openapi`/`bun sdk` encadeiam `nx run api-typescript:emit-openapi` e `nx run client:generate`.
Em T1, rodar `bun contracts && bun emit-openapi && bun sdk` em sequência produziu um `openapi.json` e um
`packages/client/dist` SEM o evento novo — `grep -c "integration.thread.message_ingested"
packages/api/typescript/public/docs/openapi.json` retornava `0` apesar do `emit-openapi` ter rodado
"fresh" (sem "[local cache]" no log daquela chamada isolada). A causa: a chamada seguinte (`bun sdk`)
reinvoca `nx run api-typescript:emit-openapi`, e o log dessa segunda chamada mostrava
`[local cache]` — reaproveitando um hash que, pelo conteúdo observado, correspondia a uma rodada
ANTERIOR à edição do contrato (não à rodada fresh que acabara de rodar). `bun x nx run
api-typescript:emit-openapi --skip-nx-cache` seguido de `bun x nx run client:generate --skip-nx-cache`
corrigiu — o grep passou a `1`. T2 repetiu o `--skip-nx-cache` proativamente pelo mesmo motivo, e T5.3
forçou `--skip-nx-cache` no gate `bun tsc` para eliminar a mesma classe de dúvida antes de reportar
"PASS" (confirmado: mesmo resultado com e sem cache, 0 erros).

**Ação para o founder:** a task graph de `emit-openapi`/`client:generate` provavelmente tem `inputs`
mal declarados (não capturam a dependência cruzada em `packages/contracts/generated/typescript/src`
como um input do hash) — o mesmo tipo de gap que motivou o `check:generated` script (comentário do
próprio arquivo: "The drift class bit the repo three times in one week"). Não corrigido aqui —
fora do escopo de B5, registrado para follow-up.

---

## (f) Correções mecânicas de comentário fora do file-list declarado das Tasks

T2 apagou `BrowserFrameEnricher`; 4 arquivos fora do "Files to write" de qualquer Task ainda citavam
o nome por extenso em docblock: `packages/api/typescript/src/shared/context-map.ts` (nota de
`TABLE_READ_EDGES`, `ui`→`issue`), `packages/api/typescript/src/agent/usecases/DeclareIssueComplete.ts`
(justificativa de por que `key` é opcional), `packages/api/typescript/src/thread/handlers/RecordStopFromExecution.ts`
(por que `threadId` vem do payload), `packages/api/typescript/src/thread/services/ThreadStatusDeriver/ThreadStatusDeriver.ts`
(por que `derive` fica público). Editados para não nomear a classe apagada, preservando o significado —
verificado ANTES de editar que a fossil-edge de `context-map.ts` não quebraria (`GetHomeDashboard.ts`
também lê `issues`, então a edge `ui`→`issue` continua viva independente do enricher) e que `derive()`
continua chamado por `DrizzleThreadStatusDeriver` (não órfão). `bun test tests/architecture` — 133 pass,
0 fail — confirmou que nenhuma rail quebrou. Ajuste mecânico, sem mudança de comportamento, anotado no
commit T2+T3.

---

## (g) O que já estava satisfeito em HEAD (G-A..G-D do plano) — não reaberto

- **G-A (AC-2):** `thread-stop-resolved.tsp` já tinha `threadId: string` não-opcional desde o B4 T7
  (`a29be66d`). Confirmado por leitura antes de T1; nenhuma Task tocou o arquivo.
- **G-B (AC-4):** `PublishThreadIntegrationEvents`'s ramo `stop_resolved` já populava `threadId` do
  domain event sem lookup, provado por `stop-control-plane.flow.test.ts` (caso AC-7, thread-level stop
  sem `issueId`). T1 só adicionou o ramo `message_ingested` — o ramo `stop_resolved` é byte-idêntico
  entre HEAD e o commit `e76cf055`.
- **G-C:** o front já escutava `integration.thread.stop_raised` desde o B4 T8; os 3 `browser.*` e o
  enricher ainda existiam em HEAD — exatamente o que T2/T3 removeram.
- **G-D:** o transporte `publish()`→lane `integration`→poller já era durável desde o B3 (emenda O1).
  T1 não precisou de nenhuma mudança de infra — só publicar o evento novo pelo caminho existente.

---

## Notas finais

- **`bun e2e` não foi usado** — `cd packages/e2e && bun run test`, conforme a nota do plano.
- **Nenhuma Task tocou** `.specs/2026-07-30-rust-wire-and-tauri-sdk-design.md`, o stash, ou
  `packages/app/tauri/**` — confirmado por `git diff --name-only a471d168..HEAD` (§(c) acima), zero
  arquivos nesses caminhos.
- **Dois achados ficam pendentes de decisão do founder**, nenhum virou Task desta frente (disciplina
  anti-invenção): (1) `packages/app/react/CLAUDE.md:226-234` descreve `BrowserFrameEnricher` como
  padrão ativo — precisa de uma reescrita de conteúdo, não um s/nome/nome/; (2) os 38 findings
  pré-existentes de `bun detect` (component-props + Go projection-shape + Go enum-literals), zero
  interseção com o diff de B5.
- **A armadilha de cache do nx em `emit-openapi`/`client:generate`** (§(e)) já mordeu esta frente duas
  vezes (T1, e T2 preventivamente); recomendado abrir um follow-up para consertar os `inputs`
  declarados da task graph, não outra rodada de `--skip-nx-cache` manual.
