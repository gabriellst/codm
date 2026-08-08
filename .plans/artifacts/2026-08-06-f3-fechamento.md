# F3 — fechamento do produto #2 (Ronda), verificado de fora

> **O que é este arquivo.** A verificação **independente** das 15 ACs da FASE 3 do goal
> (`codedm/.plans/2026-08-03-goal-produtos-broker-e-validacao.md` §FASE 3 — as mesmas 15 do produto
> #1, nicho diferente). Escrito por um agente que **não construiu** o Ronda: leu a árvore, rodou a
> bateria, e cita arquivo:linha, contagem e exit code para cada linha.
>
> **Objeto:** `/Users/work/Desktop/Projetos/pessoal/ronda`, `main` @ `e3877f6426d1e97cc938d1129cea9de9f0a17fe8`
> (`docs(bootstrap-log): fricções 27–37 — o que a integração entre PROCESSOS achou`).
> **Working tree limpo antes e depois** — `git status --short` vazio nas duas pontas; o único comando
> que sujou (`bun check:generated`, 6 arquivos gerados) foi revertido com `git checkout --` e o HEAD
> conferido igual. Nada foi commitado.
>
> **Infra usada:** `ronda-backend-postgres` :5452, `ronda-backend-redis` :6399, `ronda-backend-lgtm`
> — todos `Up (healthy)`, projeto `ronda`, sem colidir com o vizinho (`mira-*` em 5442/6389,
> `medscall-*` em 5432/6379).
>
> **Método de prova.** Todo comando medido rodou com **redirect para arquivo + `echo "EXIT=$?"`** —
> nunca cano, nunca `bun --cwd <pkg> run <script>` (as fricções #4/#5/#17 do Mira). Contagem lida do
> log salvo, exit code lido do arquivo `.exit`.

---

## 1 · As 15 ACs

Legenda: **✅** provado · **✅⚠️** provado com ressalva nomeada · **❌** reprovado.

| # | O que o goal pede | Prova citada | Estado |
|---|---|---|---|
| **1** | **backend Go** | Contexto `fleet` completo: **55 arquivos `.go`** em `packages/api/go/internal/fleet/` (9 subpastas), **21 serviços** (`telemetry_generator.go`, `window_aggregator.go`, `monitor_evaluator.go`, `heartbeat_sweeper.go`, `runbook_applier.go`, `evidence_freezer.go`, `hub.go`, `session_validator.go`, `probe_runner.go`, `log_emitter.go`…), **4 projeções + 2 projectors**, **6 endpoints** (`fleet_endpoints.go`: `POST /windows`:62, `POST /runbooks`:171, `GET /series`:255, `GET /registry`:331, `GET /snapshots/{id}`:378, + `StreamFleet`). `go test ./...` **exit 0** — 90 pass / 4 skip / 0 fail (9 pacotes ok); `go -C core test ./...` **exit 0** — 45 pass / 2 skip / 0 fail (13 pacotes ok) | ✅ |
| **2** | **backend TypeScript** | 3 contextos de domínio novos + BFF: `watch` (3 entities · 13 usecases · 13 controllers · 13 events), `runbook` (2 · 5 · 4 · 6), `incident` (5 · 11 · 7 · 15), `ui` (13 query use cases · 19 controllers), sobre os plugados (`auth`, `billing`, `quota`, `owner`, `notifications`). `bun test` em `packages/api/typescript` **exit 0** — **1363 pass / 10 skip / 0 fail**, 3105 `expect()`, 1373 testes em 184 arquivos, 78,95 s | ✅ |
| **3** | **agentes na base do codedm** | `src/incident/agents/`: `IncidentTriageAgent/{IncidentTriageAgent,prompt,types,index}.ts` + `IncidentReplyAgent/{…}.ts` + `citation.ts` + `claim.ts` + `window.ts`. Seam `AgentRunner/` com **4 implementações**: `ClaudeAgentRunner`, `StubAgentRunner`, **`E2eStubAgentRunner`** (`services/AgentRunner/E2eStubAgentRunner/E2eStubAgentRunner.ts` — a fricção **#3** do log, que dizia *"não existe no exemplar"*, **foi construída, não herdada**), + o abstrato. `AgentRunnerFactory/FixedAgentRunnerFactory.ts` dona do shutdown | ✅ |
| **4** | **MCP disponível** | Porta em `src/incident/mcp/{door,exposure,index}.ts`. **9 controllers declaram `static override readonly mcpScopes`** — `ui/GetMyAccount.ts:33`, `GetFleetGrid.ts:67`, `GetIncidentDossier.ts:103`, `ListIncidents.ts:62`, `ListMonitors.ts:78`, `ListPlans.ts:44`, `GetScoreboard.ts:53`, `GetFocusPanel.ts:72` e `runbook/ProposeRunbook.ts:87` (escopo `RUNBOOK_PROPOSAL`). A trava central é **auditável por ausência**: nenhum controller que *executa* runbook declara escopo, e `incident/controllers/index.ts:8` documenta a regra. `McpScope` vem de `packages/contracts/wire/enums/mcp-scope.tsp:9` | ✅ |
| **5** | **Go autentica via `getSession` do TS pelo client gerado** | `packages/api/go/internal/fleet/services/session_validator.go` — **`:15`** importa `tsclientgen "template/client-go/pkg/typescript"`, **`:24`** declara a fatia `GetSessionWithResponse(...)`, **`:71`** faz a chamada, **`:89`** `withCookie` encaminha o `Cookie` do navegador na chamada serviço-a-serviço. Fio de DI: `internal/fleet/module.go:141-143` (`newSessionValidator` recebe `*tsclientgen.ClientWithResponses`) → `controllers/stream_fleet.go:62`. Testes: `session_validator_test.go` — **5 testes** contra `httptest` (`:20` resolve 200, `:50` sem cookie, `:62` 401→`SESSION_EXPIRED`, `:73` autenticado sem owner, `:90` TS inalcançável→`COLLECTOR_UNAVAILABLE`), todos verdes no `go test` acima. **Prova viva:** o log do `bun e2e` mostra `GET /api/v1/fleet/stream status=403` virando `status=200` logo após `[auth] user registered` — o caminho inteiro exercitado com os três processos no ar | ✅ |
| **6** | **TS chama o Go pelo client gerado (as duas direções de uso)** | **Metade de leitura — REAL e ligada:** `src/incident/services/SdkWindowClient.ts:95` (`export class SdkWindowClient extends WindowClient`), `:16-17` importa `Client` de `@template/client-typescript` e os tipos `FreezeEvidence*` de `@template/client-typescript/go`; ligado em `incident/registry.ts:101` (`real: SdkWindowClient`). Teste: `SdkWindowClient.test.ts` — **12 `it()`**, incluindo o `X-Owner-Id` (`:231`) e a janela vazia recusada (`:204`). **Metade de escrita — NÃO ligada.** Ver ressalva **R1** | ✅⚠️ |
| **7** | **app react** | **94 `.tsx`** em `src/routes/`; console com **31 componentes** sob `(app)/console/-components/`, dossiê, wizard, planos, conexões-MCP, barra de plantão. Consome os hooks Go gerados diretamente do navegador: `useGetSnapshot` (`FrozenEvidencePanel/index.tsx:27`), `useListSeries` + `useGetRegistry` (`WizardShell/Step3Monitor/index.tsx:27`), `useListActivity` (`EvidenceStrip/index.tsx:27`), com a base em `src/lib/config.ts:18` → `router.tsx:13`. `nx run app-react:test` **exit 0** — 102 pass / 0 fail (12 arquivos) | ✅ |
| **8** | **landing astro `[locale]/`** | `packages/app/astro/src/pages/[locale]/` com `index.astro`, `planos/index.astro`, `blog/{index,[...slug]}.astro`, `blog/rss.xml.ts`, conteúdo `pt`+`en` separado (`_content/home.{pt,en}.json`, `blog/_content/{pt,en}/`). A regra *"post só-pt não gera `/en/`"* está implementada e comentada em `blog/[...slug].astro:11-23` (`getStaticPaths` deriva **um path por par (locale, slug) real**, sem produto cartesiano) e `:36` (sem `hreflang` cruzado para rota que não existe) | ✅ |
| **9** | **desktop tauri, services browser/native** | `packages/app/tauri/src-tauri/src/` — `commands/{boot,secrets,supervision}.rs`, `sidecars/{fleet,gate,lifecycle,reaper,supervision}.rs`, `api/mod.rs`, mais o rail `tests/no_raw_http.rs`. `nx run app-tauri:test:rust --skip-nx-cache` **exit 0** — **45 + 4 = 49 testes**, 0 falhas. `nx run app-tauri:test --skip-nx-cache` **exit 0** — 14 pass (config/geração). Ressalva **R2** (sonda de vivacidade) | ✅⚠️ |
| **10** | **onboarding wizard bonito** | `routes/(app)/onboarding/-components/WizardShell/` com os **4 passos** em pasta própria (`Step1Source`, `Step2Services` + `ServiceCard`, `Step3Monitor`, `Step4Posture`) + `StepIndicator` + `WizardPanel`. Os passos 1–3 leem a frota **do coletor Go** pelo client gerado (ver AC #7). E2E prova o caminho inteiro: `06-onboarding-wizard.spec.ts:36` *"percorre os 4 passos e abre o console com a frota transmitindo"* — **12,1 s, verde** — e `:105` *"o rascunho não sobrevive a um reload — e o clamp devolve ao passo 1"* — 3,7 s, verde | ✅ |
| **11** | **realtime com eventos** | **Canal 2:** `ui/controllers/ListenEvents.ts:79-91` — os **11 `BROWSER_EVENTS`** declarados e nomeados, filtro de tenancy por `payload.ownerId` em `:159-162`. **Canal 1:** SSE do Go (`GET /fleet/stream`) consumido por `app/react/src/hooks/useFleetStream.ts:54`. E2E cobre os dois: `07-console-realtime.spec.ts` (3 testes — série ao vivo, **corte de entrega com a barra NOMEANDO a parada**, rótulos i18n) e `09-channel2-cross-tab.spec.ts` (2 testes cross-tab, 1,5 min e 2,0 min). Ressalva **R3** (o 11º evento não chega) | ✅⚠️ |
| **12** | **assinaturas** | `QuotaKey` congelado em contracts com as **6 dimensões** (`packages/contracts/wire/enums/quota-key.tsp:7`), `billing/objects/PlanRegistry.ts` + `.test.ts` como fonte única dos números, telas `conta/planos` (`CheckoutDialog`, `DowngradeDialog`, `PlanColumnsSection` + `QuotaUsageBar`) e `DowngradeBanner` no console. E2E: `04-billing-subscribe-cancel-quota.spec.ts:21` verde. Preço revisto pela decisão founder de 2026-08-06 (§G-pós-F: overage `TRIAGE_TURNS` R$ 0,08 → **R$ 0,40**; Plantão R$ 179 / Central R$ 599, margem ~57%) com os **espelhos movidos no mesmo commit**. Ressalva **R3** também toca aqui | ✅⚠️ |
| **13** | **design criativo (Mobbin)** | 7 peças publicadas em `design/system/` (`console.html`, `dossie.html`, `landing.html`, `placar.html`, `primitivas.html`, `wizard.html`, `tokens.css`), pinadas em `design/design-manifest.json` com `projectId` **real** (`3b09f0c7-…`, a fricção #6 fechada) e sha256 dos 7. Os tokens chegaram ao código: `packages/app/styles/tokens.css` declara a proveniência (*"SOURCE OF INTENT: design/system/tokens.css — v1 A PRANCHA, G3, one round"*) e tem dois consumidores (react `index.css` + astro `global.css`). **Mas `bun design:check` sai 1** — ver ressalva **R4** | ✅⚠️ |
| **14** | **e2e completo incl. realtime** | `bun e2e` **exit 0** — **15 passed em 4,0 min**, 2 workers, 9 arquivos de spec. Inclui os dois canais de realtime, o falseador do canal 1 com números impressos no relatório (`[falseador] antes do corte: 1 endereço(s) inédito(s) · durante o corte: 0 novo(s) · após restaurar: 1`), monitor→incidente ponta a ponta (34 s) e cross-tab (1,5 min / 2,0 min). Base ephemeral criada e derrubada (`dropping ephemeral database: e2e_1785988052120_dc0d3c`) | ✅ |
| **15** | **storybook com testes** | `bun run storybook:build` **exit 0** — *"Storybook build completed successfully"*, Vite built in 7,18 s. Índice emitido: **276 stories em 57 arquivos / 57 títulos** (`storybook-static/index.json`). Cobre primitivas (`components/ui/stories`), `SeriesChart`, `StatCard` e as seções conectadas do console, dossiê, wizard, planos e MCP. (`storybook-static/` é gitignored — `git check-ignore` confirma; o tree ficou limpo) | ✅ |

**Placar: 15/15 provados — 11 ✅ limpos, 4 ✅⚠️ com ressalva nomeada, 0 ❌.**

---

## 2 · A bateria, comando a comando

Todos rodados neste HEAD, nesta máquina, redirect + `$?`.

| Comando | Exit | Resultado |
|---|---|---|
| `cd packages/api/typescript && bun test` | **0** | 1363 pass · 10 skip · 0 fail · 3105 expect · 184 arquivos · 78,95 s |
| `cd packages/api/go && go test ./... -count=1` | **0** | 90 pass · 4 skip · 0 fail · 9 pacotes `ok` |
| `go -C core test ./... -count=1` | **0** | 45 pass · 2 skip · 0 fail · 13 pacotes `ok` |
| `bun x nx run app-tauri:test:rust --skip-nx-cache` | **0** | 45 + 4 = 49 pass · 0 failed |
| `bun x nx run app-tauri:test --skip-nx-cache` | **0** | 14 pass · 0 fail |
| `bun run test:tooling` | **0** | 808 pass · 16 skip · 0 fail · 2088 expect · 60 arquivos · 11,28 s |
| `bun x nx run-many -t test --exclude=e2e --skip-nx-cache` | **0** | 6 projetos verdes — api-ts 1363 · core-ts 176 (25 arq.) · contracts 83 (8 arq.) · app-react 102 (12 arq.) · app-tauri 14 · api-go (acima) |
| `bun run tsc` | **0** | 9 projetos (cache) |
| `bun x nx run-many -t tsc --skip-nx-cache` | **0** | 9 projetos, sem cache |
| `bun x nx run-many -t lint --skip-nx-cache` | **0** | 4 projetos |
| `bun e2e` | **0** | **15 passed (4,0 m)** |
| `bun run detect` | **0** | *"detect: all 9 detectors clean"* — 0 findings, 0 gating |
| `bun run storybook:build` (em `packages/app/react`) | **0** | build completo; 276 stories / 57 arquivos |
| `SYNC_PARENT_PATH=…/template-fullstack bun run sync:check` | **1** | **1 failure em 1642 caminhos** — a declarada (ver R5) |
| `bun run design:check` | **1** | schema do manifest recusado (ver R4) |
| `bun run check:generated` | **1** | 6 arquivos gerados fora de sincronia (ver R6) |
| `cd packages/api/typescript && bun test src/incident/agents/citation.m1.test.ts` | **0** | Portão M1 ao vivo: **(a) 1567/1567 = 100,0%** · **(b) 53/177 = 29,9%** (alvo 80%) · 11 pass |

> **Nota sobre `bun run sync:check` sem env.** Rodado cru ele sai 1 por **outro** motivo: tenta
> `git clone --bare https://github.com/template/template-fullstack`, que não existe (status 128). O
> `parent.repo` do `sync.yaml` é placeholder por desenho (fricção #23 do Mira) e o caminho real é
> `SYNC_PARENT_PATH`. Registrado aqui porque um leitor futuro vai tropeçar nisso.

---

## 3 · Ressalvas honestas

### R1 — **A segunda metade da AC #6 não está ligada, e o mundo mudou embaixo dela** ⚠️ *(achado novo — não declarado em lugar nenhum)*

`.specs/ronda-modelagem.md` §5.4 escreve a AC #6 como **duas direções de uso**: `POST /fleet/windows`
(leitura congelada) e **`POST /fleet/runbooks`** (a única escrita do produto na frota). A primeira
está ligada e testada. A segunda **não**:

```
packages/api/typescript/src/runbook/registry.ts:52
  { token: FleetRunbookClient, mock: Unavailable…, real: UnavailableFleetRunbookClient }
```

`UnavailableFleetRunbookClient.apply()` **lança `FLEET_UNAVAILABLE`** em todos os três ambientes,
inclusive `real`. A justificativa está escrita no docblock do arquivo (`:11-14`) e **está factualmente
desatualizada**:

> *"`packages/client/dist/typescript/src/go/Client.ts` has no `applyRunbook` and no way to reach one.
> So a call into the generated client cannot compile here"*

Medido hoje, e é o contrário:

- `packages/api/go/public/openapi.json:90` → `"operationId": "ApplyRunbook"`
- `packages/client/dist/typescript/src/go/Client.ts:24` → `const call = applyRunbook as (…)`
- `grep -rn "applyRunbook" packages/api/typescript/src` → **0 chamadas**; não existe `SdkFleetRunbookClient`

Ou seja: o endpoint existe no Go, a operação existe no client gerado, e o TS ainda está preso ao
adaptador de ausência. Pior, o falseador **pina o furo**: `runbook.smoke.test.ts:81` asserta
`.toBe('UnavailableFleetRunbookClient')` — o teste que existia para avisar *"o dia em que o real
chegar e a ligação não for trocada"* hoje **carimba** o estado errado como esperado.

**Consequência de produto, medida no desenho:** `ApplyRunbookOnFleetHandler` deixa a execução
`PENDING` e retryável para sempre; o ticket do operador nunca sai de "pendente". A trava humana
(AC #4) continua intacta — nada executa sozinho —, mas o *loop* que a D-3 descreve (runbook aplicado →
serviço se recupera → o canal 1 mostra) **não fecha neste repo**.

**Por que ainda marquei ✅⚠️ e não ❌:** a AC pede *"TS chama o Go pelo client gerado"*, e isso está
provado com adaptador real, teste e ligação (`SdkWindowClient`). O que falta é a **segunda chamada**,
que a modelagem do Ronda tornou mais forte que a do #1 por decisão própria. É dívida de escopo
auto-imposto, não falha do contrato do goal — mas é **dívida não declarada**, e é a mais séria deste
fechamento.

**Conserto:** ~30 linhas (`SdkFleetRunbookClient` espelhando `SdkWindowClient`), trocar `real:` na
`registry.ts:52` e virar a asserção do smoke.

### R2 — **A AC #9 continua não plenamente mediável** (fricção **#6 do Mira**, `aberto`)

A janela do Tauri suspende `rAF`; sem sonda de vivacidade de renderização no shell do template, "a
janela pintou" é indistinguível de "a janela está lenta". O próprio log do Ronda registra isso como
**declarado, não assumido** (`research/bootstrap-log.md:296`), com a mitigação por desenho: a
superfície desktop daqui é uma **barra de estado**, não 4 gráficos de alta frequência. O conserto mora
no **template**, não neste produto. Os 49 testes Rust e os 14 de config provam o shell, o supervisor
de sidecars e a geração — **não** provam pixel na tela.

### R3 — **O 11º evento do canal 2 nunca chega ao navegador** (lacuna declarada no ponto de uso)

`ListenEvents.ts:68-78` declara: `integration.billing.subscription_changed` está na lista dos 11, mas
é **herdado e inalterado**, com payload vazio — o owner viaja só no envelope. O filtro de tenancy
(`:159`) lê `event.payload`, então esse evento **falha o `safeParse` e não alcança cliente nenhum**.
Efeito: *"as cotas sobem imediatamente, sem novo login"* (AC #12) **não vale** pelo canal 2 — o
medidor só se move quando outro evento invalida a query. Os outros 10 redeclaram `ownerId` e passam.
Conserto de uma linha, e o arquivo diz qual: fallback para `event.ownerId` no broadcaster (o irmão
Mira já carrega como `ownerIdOf`, só não chegou ao pin do pai deste repo).

### R4 — **`bun design:check` sai 1: o manifest de design não obedece ao próprio schema** ⚠️ *(achado novo)*

```
design/design-manifest.json: unknown top-level key 'systemVersion' — the manifest has exactly four:
projectId, projectName, lastSyncedAt, files
```

Duas divergências: (a) três chaves a mais (`systemVersion`, `planId`, `note`) e (b) `files` é
`{ "console.html": "<sha>" }` em vez de `{ "design/system/console.html": { "sha256": "…" } }`.

**Não é gate quebrado — é o manifest.** Controle rodado: o `scripts/design/check.ts` do Ronda e o do
Mira têm **sha256 idêntico** (`f3364eb1ec…`), e no Mira o mesmo comando sai **0**. O manifest do Mira
está no formato certo; o do Ronda não.

Causa provável, e é irônica: o manifest foi **reescrito à mão** ao fechar a fricção **#6** (o
`projectId` fabricado), e a reescrita preservou a nota da fabricação — corretíssimo como registro —
mas saiu do schema que o gate cobra. **O conserto da #6 abriu a #4-desta-lista.** Nada declara isso
em lugar nenhum (`grep design:check` no `bootstrap-log.md`/`PRD.md`/`sync.yaml` → 0 ocorrências
sobre este estado).

### R5 — **`sync:check`: 1 falha, e é a declarada** ✅ *(ressalva conhecida, não vermelho escondido)*

```
DRIFT-CHILD-ONLY packages/api/typescript/core/src/types/EventHandler.multiEvent.test.ts
  — child-only file under the inherited surface (parent@5f328d35c2ea has no such file)
sync:check — 1 failure(s) against parent@5f328d35c2ea (1642 path(s) checked)   EXIT=1
```

**É exatamente a lacuna de vocabulário que o `sync.yaml:375-388` documenta em prosa**, e a ausência
do arquivo da lista de `adapted` **é a decisão**, não o esquecimento: ele é o falseador do conserto do
`EventHandler.ts` (reprova contra a versão anterior com `["UNMATCHED:test.alpha","UNMATCHED:test.beta"]`),
é genérico ponta a ponta, e o schema do `sync.yaml` só tem `{path, why}` — não existe classificação
`owned`, e `adapted` para um arquivo que o pai nunca teve *"documenta nada; o arquivo simplesmente é
possuído"*. Narrar o glob (enumerar 146 dos 147 arquivos de `core/`) abriria buraco **permanente** na
superfície herdada para acomodar estado **temporário**.

Portanto: **1 falha declarada, em pé de propósito**, como lembrete de que existe um PR a abrir ao pai.
Fecha no dia em que o par `EventHandler.ts` + este teste subir. **É o gate funcionando.**

### R6 — **`bun check:generated` sai 1: 6 arquivos gerados carregam a marca antiga** ⚠️ *(achado novo)*

`bun check:generated` é gate **obrigatório da fase F** pelo próprio runbook (`docs/BOOTSTRAP.md:270`).
Hoje ele reprova:

```
✗ committed generated output is OUT OF SYNC with its sources:
  M packages/client/dist/typescript/src/typescript/mcp/scopes/{runbook-proposal,system,telemetry-reading}/.mcp.json
  M packages/client/dist/typescript/src/typescript/mcp/scopes/{runbook-proposal,system,telemetry-reading}/server.ts
EXIT=1
```

O diff é de **uma linha por arquivo**, e é a marca:

```diff
-              "template-backend": {
+              "ronda-backend": {
```

O `openapi.json` emitido diz `"title": "ronda-backend"`
(`packages/api/typescript/public/docs/openapi.json:5`, gitignored/regenerado); a saída **commitada**
do Kubb ainda diz `template-backend`. É a **mesma família das fricções #15/#16** (o rebrand reescreve
o código-fonte e a saída de codegen commitada fica para trás) — o `MCP_SERVER_KEY` já foi para
`'ronda'` no core, mas o `dist/` nunca foi regenerado e recommitado depois disso.

Sujeira que ele causa: rodar o gate **modifica 6 arquivos rastreados**. Foram revertidos
(`git checkout --`, tree limpo, HEAD `e3877f6` intacto). **Conserto: `bun sdk` + commit dos 6.**

### R7 — Fricção **#29**, `aberto` por decisão: **4 escritas de `DutyProfile` sem uma leitura**

O contrato tem `CreateDutyProfile`, `SetPosture`, `EnableAlertRoute`, `DisableAlertRoute` — e
**nenhum `GetDutyProfile`**. Sem hook gerado, a tela respondeu com store de cliente
(`useDutyProfileStore`, com `⚠️ FURO DE SDK` escrito no cabeçalho): **estado espelhado sem fonte**. O
log é explícito sobre por que nenhum gate pega isso — *"um controller quebrado reprova; um controller
ausente é silêncio"*. Status `aberto`, declarado, com o conserto nomeado (publicar a leitura + cruzar
cada consulta da modelagem contra um controller no checklist pré-implementação, como a #25 mandou
fazer com nomes de serviço).

### R8 — Portão **M1(b)** em aberto-declarado, e **M2** respondido pela tabela nova

Rodado ao vivo neste HEAD (`citation.m1.test.ts`, semente `0x4d315230`, 240 janelas, 980 sentinelas):

| | medido | alvo | estado |
|---|---|---|---|
| **M1(a)** resolução por id | **1567/1567 = 100,0%** | 100% | **DECIDIDO, verde** |
| **M1(b)** cobertura por tipo | **53/177 = 29,9%** | 80% | **EM ABERTO, não reprovado** |

O (b) fica aberto por um motivo escrito no próprio arquivo e reproduzido no §G-pós-F do PRD: o dublê é
**cego a conteúdo por desenho**, e leitor cego nenhum limpa 80% contra uma composição 71,1 / 16,2 /
12,7 citando ~6,5 índices (seriam precisos ~17). Instrumentado como **piso de regressão**, não como
reprovação. **E o kill do PRD não disparou** — o histograma mostra o oposto de fixação: os tipos raros
são **sobre**-citados (log 16,2%→21,1%, sonda 12,7%→17,7%).

**M2** disparou o kill (piso R$ 0,1698/turno contra teto de R$ 0,08 — 2,12×) e foi resolvido pela
decisão founder de 2026-08-06: **o modelo fica, a tabela sobe** (overage → R$ 0,40; Plantão R$ 179 /
Central R$ 599; margem ~57% nos dois). Segue com o pré-requisito da **fricção #7 do Mira** aberto — o
número real exige caminho de API direto reportando `usage`; `AgentTurnUsageEvent.costMicros` é o
instrumento já no lugar esperando esse dia.

### R9 — Nota de procedimento: **o irmão de formato não existe no disco**

O contrato me mandou ler `.plans/artifacts/2026-08-04-f1-fechamento.md`. Varri
`/Users/work/Desktop/Projetos/pessoal` inteiro (`find … -name "*fechamento*"`, `-name
"*produtos-broker*"`): **nem o artefato da F1 nem o próprio arquivo de goal existem em disco**. Os
dois logs de bootstrap citam o goal como `codedm/.plans/2026-08-03-goal-produtos-broker-e-validacao.md`,
e **não há diretório `codedm/`** — o repo real é `codm/`, cujo `.plans/artifacts/` existe e guarda 14
artefatos `*-closure.md`. As 15 ACs desta tabela foram reconstruídas da fonte primária:
`ronda/.specs/ronda-modelagem.md` **§9 — "Mapa AC → modelo (as 15 features do goal)"**, cruzada com as
citações de AC espalhadas pelo `PRD.md` e pelo `bootstrap-log.md`. Este arquivo foi escrito no caminho
literal pedido; se o destino certo é `codm/`, é um `mv`.

---

## 4 · #1 vs #2, em números

*A seção que a F4 vai consumir. Tudo medido nos dois repos nesta sessão, salvo onde marcado.*

| | **#1 — Mira** (broker/trading) | **#2 — Ronda** (monitoramento de infra) | leitura |
|---|---|---|---|
| **Fricções no log** | **79** | **37** | **−53%**. Contadas por linha de índice **e** por cabeçalho de entrada, batendo nos dois |
| **Rodadas de gosto (G3)** | **4** (`PRD.md:553` rodada 1 reprovada · `:561` rodada 2 · `:569` rodada 3 · `:576` aprovado na 4ª) | **1** (`PRD.md:939` aprovado direto; `packages/app/styles/tokens.css` grava *"G3, one round, 2026-08-04"*) | **−75%**. A gramática v4 do Mira foi herdada como **grade**, não como bundle |
| **Nascimento** | ~20 fricções nas fases de stamp/bootstrap (`Fase 0`=4 · `F0`=4 · `F1`=8 · `Desktop`=3, mais as de `pull`) | **10/10 verde**, com **1 repetição parcial fechada no ato**: a **#16** (`bun rebrand` não pergunta a grafia casada) era repetição parcial da **#11 do Mira** ⇒ pela regra da F3 **voltou para a F2** e foi consertada **no pai antes da instância** (`4070e54a4`), arrastando as 3 irmãs (`92a296820`, `404365c9b`, `e8f653042`) | A regra parent-first **funcionou como catraca**, não como intenção |
| **Fricções da fase F** | **21** | **11** | **−48%** |
| **…destas, que moram no `template`** | — | **5** (#27 detector · #28 glob de stores · #31 core envelope · #35 runner do e2e · #37 core `EventHandler`) | O "5 vs 5" do enunciado se sustenta aqui |
| **Classe das 5 do #2** | as 5 do #1 **não reapareceram** (conferência de zero-repetidas refeita entrada a entrada em D, D2, E e F — `bootstrap-log.md:14-27, 95-108`) | **classe NOVA: fronteira entre PROCESSOS.** O `sync.yaml:369-374` nomeia por quê: *"só apareceram quando os TRÊS processos subiram juntos pela primeira vez, porque toda suíte da casa roda `mock` (captura) ou `integration` (em processo) e os testes Go usam índice em memória — nenhuma delas jamais exercitou a fronteira ENTRE processos"* | **É o achado estrutural do produto #2.** O e2e de produto foi o **primeiro instrumento capaz de vê-los** |
| **Commits** | **107** (58 em 08-03 · 49 em 08-04) | **57** (17 em 08-04 · 34 em 08-05 · 6 em 08-06) | **−47%** para uma superfície comparável |
| **Dias de parede** | **2** | **3** (o 3º só decisões do founder + log: 6 commits) | ~2 dias de construção nos dois |
| **api-ts** | 1351 pass / 10 skip / 0 fail (183 arq.) | **1363 pass / 10 skip / 0 fail** (184 arq.) | par |
| **Go (internal + core)** | 95 + 40 = **135** pass (4 skip) | 90 + 45 = **135** pass (6 skip) | empate exato |
| **Rust (tauri)** | 42 + 4 = **46** | 45 + 4 = **49** | +3 |
| **tooling** | 803 pass / 16 skip (60 arq.) | **808 pass / 16 skip** (60 arq.) | +5 |
| **core-ts · contracts · app-react** | não medido nesta sessão | 176 · 83 · 102 | — |
| **Stories** | **62** arquivos | **57** arquivos / **276** stories (`storybook-static/index.json`) | build verde nos dois? só o #2 foi medido aqui |
| **E2E** | 10 specs / **16** testes (contagem **estática**, não executada) | 9 specs / **15** testes — **executados, 15/15 em 4,0 min** | par em cobertura; o #2 tem a execução provada |
| **`sync:check`** | — | **1 falha em 1642 caminhos**, declarada | ver R5 |
| **Gates da fase F reprovando hoje** | — | **2 não declarados** (`design:check`, `check:generated`) + 1 declarado (`sync:check`) | ver R4 / R6 |

**A frase que os números sustentam:** o produto #2 custou **metade** das fricções, **um quarto** das
rodadas de gosto e **metade** dos commits do #1, entregando a **mesma massa de testes** — e as
fricções que sobraram na fase final são de uma **classe que o #1 não conseguia produzir**, porque
nenhum instrumento da casa exercitava a fronteira entre processos antes de existir um e2e de produto
com os três backends no ar.

---

## 5 · O que fica para a F4

### 5.1 Os 5 upstreams marcados (todos com `why` escrito no `sync.yaml`)

| # | Arquivo | O que o PR ao pai leva |
|---|---|---|
| 1 | `packages/api/typescript/core/src/types/EventHandler.ts` (+ o par `EventHandler.multiEvent.test.ts`) | `intoSubscribedClass` — o caminho multi-evento devolvia a **família** (`BaseDomainEvent`) e não a **classe**; contra handler que discrimina por `instanceof`, os onze testes davam falso e a execução **saía calada**. Fecha a única falha do `sync:check` (R5) |
| 2 | `packages/api/typescript/core/src/services/Mediator/RedisExternalMediator.ts` | conforma o mediator externo real ao `toWire`/`fromWire` |
| 3 | `packages/api/typescript/core/src/types/BaseIntegrationEvent.ts` | envelope **flat no transporte** (o contrato de `packages/contracts` é flat; o TS emitia aninhado). Sintoma medido com 3 processos no ar: projector Go gravava `service_id = ""` e `GET /fleet/stream` devolvia 403 `SERVICE_NOT_OBSERVED` **para sempre** |
| 4 | `packages/api/typescript/tests/architecture/mcp-exposure.test.ts` | `.map()` que resolve membro→valor do enum (`McpScope` é kebab-case por desenho) |
| 5 | `packages/client/generators/typescript.ts` | `.js` nos subpath imports do MCP SDK — hoje o server emitido **type-checa e não roda**, que é a forma de bug que um gate só-`tsc` embarca verde |

Os 3 primeiros são **bugs de kernel Tier 1 achados pelo e2e de produto**; `adapted` no `sync.yaml` é
o **estacionamento**, não o destino. No dia do PR essas linhas somem.

### 5.2 As fricções de trem #42–47 do Mira

Vêm do lote `pull` do log do Mira (8 entradas) e continuam **abertas no pai**, portanto valem para
todo filho — inclusive o Ronda, que ainda não puxou. A mais perigosa, medida no Mira e confirmada em
2º pull, é a **#43**: *o `sync:pull` aplica **commit pela metade** e relata sucesso* (`applied 19`,
exit 0, `sync:check` limpo, `bun test` quebrado) sempre que um commit do pai **cruza a fronteira da
superfície** — só a parte herdada entra. No 2º pull: dos 59 arquivos mudados, 46 herdados, 1 adapted
e **12 fora**; 4 commits cruzando. A checagem que falta (classificar o intervalo por superfície e ler
os commits dos dois lados) é **barata** e foi feita à mão. **F4: virar isso em aviso do trem.**

### 5.3 O runbook — `docs/BOOTSTRAP.md`

323 linhas, DAG A→F com portões nomeados (G1 · G2 · G2.5 · G3 · G4 · G4.5 · G5 · F) e a bateria da
fase F tabelada (`:263-274`). Duas coisas para a F4:

1. **A bateria da fase F está escrita e não está toda verde neste repo.** `design:check` não está na
   tabela (deveria estar — é gate de fase C que ninguém re-roda) e `check:generated`, que **está**,
   reprova (R6). Um runbook cuja bateria o produto de referência não passa é um runbook que ensina a
   pular linha.
2. **§Known gaps to build (once, in the template)** (`:293+`) é onde os 5 upstreams e o kill-tree do
   dev/e2e (fricção #77 do Mira, #35 do Ronda) devem virar itens com dono.

### 5.4 Dívidas do produto que a F4 herda

- **R1** — `SdkFleetRunbookClient` (~30 linhas) + trocar `real:` em `runbook/registry.ts:52` + virar a
  asserção de `runbook.smoke.test.ts:81`. **A maior**: sem ela o *loop* da D-3 não fecha.
- **R7** — publicar `GetDutyProfile` e apagar a `useDutyProfileStore`.
- **R3** — o fallback de uma linha no broadcaster (`event.ownerId` quando o payload não tem), que o
  Mira já carrega como `ownerIdOf`.
- **R4** — reescrever `design/design-manifest.json` no schema de 4 chaves (a nota da fricção #6 muda
  de lugar, não some).
- **R6** — `bun sdk` + commit dos 6 arquivos de MCP com a marca certa.
- **R2** — a sonda de vivacidade de renderização no shell do template, sem a qual a AC #9 de **todo**
  produto desta linhagem segue não-mediável.

---

*Verificado em 2026-08-06 contra `ronda@e3877f6`. Working tree limpo na entrada e na saída; nenhum
commit feito. Logs completos das provas em `/tmp/ronda-f3/`.*
