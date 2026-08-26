# Frente B1 — health/readiness dos sidecars — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox (`- [ ]`) syntax.
> Each Task wraps ONE observable behavior in an outer RED→GREEN cycle.

**Goal:** Os dois backends ganham um endpoint de health que mede o que importa (banco, migrações, timers de poll — WhatsApp só como diagnóstico), a shell Rust para de pingar endpoints de negócio por coincidência e passa a probar **pela SDK Rust tipada** (`api::Api`, emenda E1), e o fail-open morre: quando o budget de 60s estoura, o operador vê uma splash com o nome do sidecar, o stderr capturado e um botão de retry — nunca o dashboard quebrado.

**Architecture:** Seis cortes na ordem obrigatória, cada um deixando os gates verdes. (1) O CORE primeiro, nascendo MORTO: `HealthCheck`/`HealthService` como cidadãos ao lado de `Controller`/`OutboxDispatcher`, com o multi-inject de `tsyringe-neo` **provado por espiga antes de qualquer check ser empilhado nele**, e os getters `running` nos dois pollers do core (o menor sinal verdadeiro existente, zero estado novo). (2) O endpoint TS — primeiro controller do repo deliberadamente sem middleware de auth — e, no MESMO commit, `emit-openapi` + regen das SDKs TS/Rust, porque a operação tipada é o que o corte (4) consome. (3) O endpoint Go, simétrico, que obriga a fechar um buraco que a spec não viu: o gateway TEM cadeia global de auth, e a rota de docs que ele proba hoje escapava dela por registrar direto no mux. (4) O supervisor Rust troca `TcpStream` cru por `api.client.<serviço>.health()`; `probe()`, o literal `health_path` e o campo `SIDECARS[].healthPath` morrem juntos. (5) O gate de readiness vira uma máquina de estados PURA e testável (`ReadinessGate` → `Reveal::Main | Reveal::BootError`), a splash entra na config gerada e o stderr passa a ser retido num ring buffer. (6) O que sobe pro template.

**Tech Stack:** TypeScript (bun, zod, tsyringe-neo, drizzle), Go (fx, net/http, database/sql), Rust (Tauri v2, tokio, `codedm-client-rust` via progenitor), TypeSpec/OpenAPI, bun:test / `go test` / `cargo test`

**Spec:** `.specs/2026-07-29-health-readiness-design.md` (inclui a Emenda do founder E1/E2)
**Spec de referência (canônica, NUNCA modificar):** `.specs/2026-07-30-rust-wire-and-tauri-sdk-design.md`
**Tasks:** 7
**Estimated minutes:** 560

---

## Ground em HEAD `b7d99053` — o que a spec diz e o que o código diz

Toda linha abaixo foi verificada por leitura/grep/execução em HEAD, não por memória.

| Afirmação da spec | Veredito | Prova |
|---|---|---|
| Decisão 1: `middlewares = []` herdado basta; nenhum middleware entra | **VERDADEIRO.** `Controller.effectiveMiddlewares` (`core/src/types/Controller.ts:189-194`) é exatamente `const scopes = (this.constructor as typeof Controller).mcpScopes; if (!scopes \|\| scopes.length === 0) return this.middlewares`. Sem `static mcpScopes`, `AgentIdentityMiddleware` não é anexado. `MainRouter` (`src/index.ts:82-86`) é construído **sem** `middlewares`, e o contexto `shared` (`src/shared/index.ts:38`) declara `BoundedContext.create` sem `middlewares` → `configureRouterControllers` mescla `[] + []`. | `sed -n '186,196p' core/src/types/Controller.ts` |
| Decisão 3: multi-inject é o PRIMEIRO uso no repo | **VERDADEIRO.** `grep -rn "@injectAll\|injectAll\|resolveAll" packages/api/typescript/src packages/api/typescript/core/src` → **0 hits**. `@inject(` também é 0 — o repo só usa `@injectable()` com injeção por tipo de classe. | grep acima |
| tsyringe-neo expõe multi-inject | **VERDADEIRO, dois caminhos.** `node_modules/.bun/tsyringe-neo@5.1.0/.../dist/index.d.ts:44` (`injectAll`) e `:127` (`resolveAll<T>(token): T[]`). | idem |
| Decisão 4: "`Metadata().Middlewares` é por-controller, **não há middleware global de auth**" no Go | **FALSO.** `internal/shared/module.go:44-49` contribui `newAuthMiddleware` (Session → APIKey) ao grupo `app_middlewares`; `core/module.go:87-92` invoca `registerMiddlewares`, que faz `router.Use(...)` de cada um; `httprouter.go:70-73` aplica TODOS os globais a TODA rota de controller. A rota `/api/openapi.json` que o probe usa hoje **escapa** disso porque `RegisterDocsRoutes` (`httprouter.go:80-92`) registra direto em `r.mux`. Trocar por um controller **muda a postura de auth** — ver D-D. | `sed -n '55,95p' core/services/httprouter/httprouter.go` |
| Decisão 4: o controller Go vai no grupo `controllers` do módulo `shared` em `core/module.go` | **IMPOSSÍVEL como escrito.** `core/` é OUTRO módulo Go (`module template/core-go`, `go.mod` próprio, consumido por `replace`), e o emissor OpenAPI só enxerga controller cujo pacote (a) casa `strings.Contains(pkg.PkgPath, "/controllers")` **e** (b) `strings.HasPrefix(pkg.PkgPath, "template/api-go/")` — `walker.go:106-111` —, carregado de `packages.Load(cfg, "./internal/...")` (`walker.go:46`). Um controller em `core-go` **não gera operação**, logo não gera método no client Rust, logo E1 não fecha. Endereço correto: `packages/api/go/internal/shared/controllers/health.go`, registrado em `internal/shared/module.go` (é onde `ListenEventsController`, o único controller do grupo shared, já vive). | greps acima |
| Decisão 5 / US-4: o path Go é `/health` | **FALSO.** `RegisterControllers` monta `"/api" + ("/"+Context se não vazio) + Path` (`httprouter.go:59-64`). Com `Context: ""` e `Path: "/health"` a rota é **`/api/health`**. Consequência benigna sob E1 (o path mora no contrato e o client gerado o carrega), mas a US precisa ser lida como `/api/health`. | idem |
| Decisão 6 / US-6 / AC-8: `healthPath` sai do hardcode via `plugins.<nome>` no `tauri.conf.json` | **SUPERSEDIDO por E2, e o resíduo é resolvível por remoção.** `grep -rn healthPath` no repo (fora de `node_modules`/`target`/worktrees) retorna **3 hits, todos em `config/sidecars.ts`**: a declaração do campo e os dois valores. `generate.ts` lê de `SIDECARS` apenas `role`, `portEnvKey` e `build`; `build-sidecars.ts` lê `role`/`build`. **Zero leitores.** Remover o campo não muda um byte de `tauri.conf.json` nem de `capabilities/default.json` — `bun desktop:generate --check` continua verde sem regenerar. | `grep -rn "healthPath"` |
| E1: `api::Api` já existe e é "the shell's only door" | **VERDADEIRO**, e a ORDEM em `setup` está errada para o probe: `lib.rs:56-64` dispara `boot_sidecar` para toda a frota e só DEPOIS chama `api::manage(app.handle())` (`:70`). O probe tipado precisa do `State<Api>` — ver D-E. | `sed -n '46,72p' src-tauri/src/lib.rs` |
| `tests/no_raw_http.rs` proíbe `reqwest` fora de `api/mod.rs` | **VERDADEIRO** — e ele **não** cobre `TcpStream`. O `probe()` atual (`sidecars/mod.rs:100-118`) escreve `GET {path} HTTP/1.1\r\n...` num `TcpStream` e passa na rail por não conter a palavra `reqwest`. | `cat src-tauri/tests/no_raw_http.rs` |
| `"visible": false` na janela principal | **VERDADEIRO**, e é GERADO: `config/window.ts:32` (`visible: false` em `WINDOW`) → `generate.ts renderTauriConf()` → `src-tauri/tauri.conf.json`. Hand-edit é vermelho (DSK-01). | `config/window.ts`, `generate.test.ts` |
| Como janelas são criadas hoje | **Só existe UMA, e ela é DECLARADA na config gerada** (`tauri.conf.json app.windows[0]`). Não há nenhum `WebviewWindowBuilder` no repo. `capabilities/default.json` lista `"windows": ["main"]` — uma segunda janela sem entrada ali não pode nem `invoke`. | `grep -rn WebviewWindowBuilder src-tauri/src` → 0 |
| `LibsqlDriver` dá `SELECT 1` e `readMigrations().pending` sem método novo | **VERDADEIRO.** `db` é `DrizzleClient` (`LibSQLDatabase`, tem `.run(sql\`…\`)` — precedente em `db/drivers/utils.ts:38`); `readMigrations()` (`LibsqlDriver.ts:252-262`) devolve `{applied, pending}`. | leitura |
| Carve-out `EMIT_OPENAPI` deixa o driver inerte | **VERDADEIRO** (`shared/registry.ts:96-100`) — e o registro de health checks é `useFactory` **lazy**, então nada faz I/O na construção. | leitura |
| Os três dispatchers guardam o timer em campo privado, sem getter | **VERDADEIRO** — e os três têm sinais DIFERENTES em qualidade. Ver D-B. | leitura |

**Quatro descobertas que a spec não previu e que este plano absorve:**

1. **`resolveAll` num token que é CLASSE ABSTRATA não lança — ele CONSTRÓI a abstrata.** Espiga executada em `packages/api/typescript` (`bun -e`, sem escrever arquivo):
   ```
   isRegistered before: false
   resolveAll unregistered: [ HealthCheck {} ]        ← a abstrata instanciada, sem métodos
   resolveAll: [ "a", "b" ]                            ← duas register() no MESMO token, ambas voltam
   resolve (single): b                                 ← resolve() devolve a ÚLTIMA
   ```
   Com token STRING o comportamento é o correto: `resolveAll unregistered STRING THROWS: Attempted to resolve unregistered dependency token: "HealthCheck"`. É exatamente o footgun que `shared/registry.ts:174-176` já documenta ("um abstract UNBOUND constrói silenciosamente uma instância sem métodos e quebra o boot"). **Por isso o token é uma STRING + guarda `isRegistered`** — e a espiga vira teste permanente (T1).
2. **Container filho SOMBREIA, não mescla.** Mesma espiga: com 2 registros no root e 1 no filho, `child.resolveAll(TOKEN)` → `["child-c"]` (o pai some). Logo **todos os `HealthCheck` precisam cair no MESMO container**. `BoundedContext.create` faz `registerAll(options.root ? container : rootContainer, …)` — todo registry de contexto vai pro `rootContainer`, e o contexto `shared` (root) resolve dele. Fecha.
3. **`packages/api/go/public/docs/openapi.json` NÃO é versionado** (`.gitignore:117`), enquanto `packages/api/typescript/public/docs/openapi.json` é (`git ls-files`). E `scripts/check-generated.ts` lista apenas `contractsGenTs`, `contractsGenGo`, `clientTsDist/src` e o openapi TS — **`packages/client/dist/rust/src` fica de fora**, embora seja versionado e regenerado por `bun sdk`. Consequência prática: a regeneração do client Rust precisa entrar no `git add` explícito de cada task, porque `check:generated` não a vigia.
4. **`app-tauri` não tem target `test` nem `tsc` no `project.json`.** `bun run test`, `bun tsc` e o pre-commit **não** rodam `cargo` da shell. Todo gate Rust deste plano é explícito por `--manifest-path`.

---

## Decisões de desenho tomadas neste plano (grounded)

### D-A — O token de multi-inject é a STRING `'HealthCheck'`, e o acesso é `useFactory` + `resolveAll`, não `@injectAll`

Duas razões medidas, não estilísticas:

1. **Token string falha alto, token abstrato falha baixo** (descoberta 1). O repo já foi mordido por "abstract não bindado vira instância sem métodos" (`shared/registry.ts:174-176`, achado do primeiro e2e real). Com string, `resolveAll` lança com o nome do token.
2. **`@inject`/`@injectAll` são zero-uso no repo.** Toda injeção é por tipo de classe. Introduzir um decorator de parâmetro só para isto seria um segundo idioma de DI; `{ useFactory }` é o idioma que `Registry.ts` já documenta e que `shared/registry.ts` já usa em 5 bindings. `HealthService` é resolvido por token de CLASSE (idioma normal) e recebe os checks por factory.

A guarda `healthChecksFrom(c)` (`isRegistered(token, true) ? resolveAll : []`) é obrigatória porque `mock`/`integration` declaram ausência (D-C).

### D-B — Um `running` por poller, e cada um usa o MENOR sinal VERDADEIRO já existente (zero campo novo)

| serviço | sinal | por que ESTE e não outro |
|---|---|---|
| `SqlExternalMediator` | `!this.stopped` | `stopped` nasce `true` (`:82`) e só é virado por `start()`/`stop()`. É literalmente "start rodou e stop não", **correto antes do primeiro start**. |
| `DrizzleOutboxDispatcher` | `this.timer !== null` | `stopping` nasce `false`, então `!stopping` mentiria antes do `start()`. `timer` nasce `null`, é setado em `scheduleNext()` e **nunca fica null durante o poll**: `poll()` não o limpa, e `scheduleNext()` anula+reatribui no MESMO bloco síncrono (`:93-101`). |
| `DrizzleMailboxDispatcher` | `this.timer !== null \|\| this.draining !== null` | `start()` chama `void this.tick()` (`:106`) — o timer só é setado **depois** do primeiro `drain()`, que é a varredura de boot. Só `timer` reportaria NOT-READY durante toda a varredura. `draining` é setado por `drain()` e anulado no `.finally` (`:120-123`), cobrindo exatamente essa janela. |

Os getters vivem nas classes CONCRETAS e satisfazem uma interface estrutural `PollingService { readonly running: boolean }` do core. **Nenhuma classe abstrata ganha membro** — `OutboxDispatcher`, `ExternalMediator` e `MailboxDispatcher` ficam intocadas, e os mocks (`MockOutboxDispatcher`, `MockExternalMediator`, `SpyMediator`, `EventEmitter2Mediator`) não precisam implementar nada.

### D-C — Os `HealthCheck` são `mock: null, integration: null`; os testes constroem `HealthService` à mão

O padrão de teste de controller do repo é construção direta (`DetectProviders.test.ts:31`: `new DetectProvidersController(detector)` → `controller.executeController(buildRequest())` → assert no `Response` real). Isso exercita `executeMiddlewares`/`effectiveMiddlewares` de verdade — que é justamente o que AC-1 pede — sem container nenhum. Declarar os checks em `mock`/`integration` só criaria um segundo caminho (mocks sem `running`, driver de arquivo temporário) para provar a mesma coisa pior.

### D-D — O Go ganha `ControllerMetadata.Public` — o gêmeo exato da decisão 1

A decisão 1 diz "primeiro controller sem middleware de auth" no TS. No Go isso **não existe como possibilidade** hoje: `RegisterControllers` aplica a cadeia global a toda rota de controller, e a única rota que escapa (`/api/openapi.json`) escapa por ser registrada fora do mecanismo. Com `CHANNEL_GLOBAL_API_KEY`/`GLOBAL_API_KEY` não-vazio, um `/api/health` registrado como controller responderia **401** e a shell nunca abriria — trocar fail-open por fail-closed-com-splash não pode significar "fail-closed porque a rota de health tem auth".

Custo real: 1 campo em `core/types/controller.go`, 1 `if` em `httprouter.go`, 1 teste novo. O parser de metadata do emissor ignora chaves desconhecidas por `switch` (`metadata.go:98-113`), então a emissão OpenAPI não muda. É também o item que fecha o GO-SHARING: o padrão "controller público" passa a existir NOS DOIS backends com o mesmo significado.

### D-E — `api::manage` sobe para ANTES da frota, e o `Sidecar` ganha `service`, não `health_path`

`Api::from_env()` só lê env e monta um `reqwest::Client` (lazy — nenhuma conexão é aberta). Construí-lo antes dos spawns é gratuito e elimina a corrida: o probe faz `app.state::<Api>()` dentro da task e o estado já está gerenciado. O docblock atual de `api/mod.rs` já diz que "requests simply fail until the readiness gate reveals the window" — o que muda é só QUANDO o `manage` acontece, não a semântica.

O mapeamento sidecar→sub-client é um fato da SHELL (qual processo é qual serviço), não do contrato — vira `enum SidecarService { Daemon, Gateway }` no descritor, com `match` total (o compilador prova a totalidade). O *caminho* — que era o literal duplicado — some de vez: ele mora no contrato e chega pelo método gerado.

### D-F — O loop de readiness vira `async` e a shell ganha `tokio` como dep DIRETA

O probe tipado é `async`. `tauri::async_runtime` **não reexporta `sleep`** (`pub use tokio::{runtime::…, sync::…, task::JoinHandle}` — `async_runtime.rs:13-20`), e `tauri::async_runtime::block_on` é `Runtime::block_on` (`:272-275`), que pania se chamado de dentro do runtime. Então: `tauri::async_runtime::spawn` + `tokio::time::sleep`. `tokio 1.53.1` **já está no `Cargo.lock`** da shell (dep transitiva do tauri), então declarar `tokio = { version = "1", features = ["time"] }` não adiciona crate nova nem mexe no lock.

### D-G — A splash é uma SEGUNDA JANELA DECLARADA na config gerada + um HTML estático em `app/react/public/`

Alternativas descartadas: `WebviewWindowBuilder` em runtime (o repo não tem nenhum, e a janela nova ficaria fora de `capabilities/default.json`, sem `core:default`, sem poder `invoke`); reusar a rota React (o console dispara queries da SDK no boot — exatamente contra os backends que estão mortos).

O caminho escolhido usa três mecanismos já provados no repo:
- **`config/window.ts` + `generate.ts` → `tauri.conf.json`**: DSK-01 (`generate.test.ts:20-26`) já é a rail de drift.
- **`public/` do vite → `dist/client/`**: `mockServiceWorker.js` está em `packages/app/react/public/` e em `packages/app/react/dist/client/` — a cópia é fato medido. Em dev, `devUrl` é `http://localhost:5173/` e o vite serve `public/` na raiz.
- **`withGlobalTauri: true`** (`tauri.conf.json app.withGlobalTauri`) → o HTML puro chama `window.__TAURI__.core.invoke('boot_failures')` sem bundler.

Dados chegam por **PULL** (`boot_failures()` lido no load), não por evento — um `app.emit` disparado antes da página carregar seria perdido.

### D-H — Retry é `app.restart()`

Zero estado novo: os descritores de `Sidecar` (data_dir/resource_dir) são computados no `setup` e não precisam ser retidos. "Retry = bootar de novo" é a semântica honesta, e comando customizado só exige `core:default` na janela (o próprio `config/capabilities.ts` documenta: *"Empty list = backed by custom shell commands … core:default covers invoke"*).

### D-I — Status HTTP do não-ready: **503**, e o payload é o mesmo nos dois casos

A Open Question da spec fica resolvida por 503 (`HttpStatusCode.SERVICE_UNAVAILABLE = 111` em `core/src/types/Http.ts:111`). Mecanismo: `Controller.buildResponse` usa o `status` retornado por `handle()` tal e qual — não é preciso lançar. O emissor OpenAPI declara **só 200** por construção (`OpenAPI.ts:837-849`), então o método gerado do progenitor casa `200u16 => Ok(...)`, `_ => Err(Error::UnexpectedResponse)` — o 503 vira `Err` e o probe repete. É o comportamento desejado, e é por isso que `is_ok()` basta como predicado de prontidão.

---

## Task T1: `HealthCheck` vira cidadão do core, com o multi-inject PROVADO antes de qualquer check ser empilhado

**Files to write:**
- Create: `packages/api/typescript/core/src/services/HealthService/HealthCheck.ts` — o abstract, os tipos de report, o token string, `healthChecksFrom`, `PollingService`
- Create: `packages/api/typescript/core/src/services/HealthService/HealthService.ts` — o agregador
- Create: `packages/api/typescript/core/src/services/HealthService/DatabaseHealthCheck.ts`
- Create: `packages/api/typescript/core/src/services/HealthService/MigrationsHealthCheck.ts`
- Create: `packages/api/typescript/core/src/services/HealthService/PollingHealthCheck.ts`
- Create: `packages/api/typescript/core/src/services/HealthService/index.ts`
- Create: `packages/api/typescript/core/src/services/HealthService/HealthService.test.ts` — a ESPIGA + o falseador do gate
- Modify: `packages/api/typescript/core/src/index.ts` — uma linha (`export * from './services/HealthService'`, na vizinhança de `./services/CommandQueue`)
- Modify: `packages/api/typescript/core/src/services/OutboxDispatcher/DrizzleOutboxDispatcher.ts` — um getter `running` + docblock (edição pontual)
- Modify: `packages/api/typescript/core/src/services/Mediator/SqlExternalMediator.ts` — um getter `running` + docblock (edição pontual)

**Files to read:**
- `packages/api/typescript/core/src/services/CommandQueue/{CommandQueue.ts,index.ts}` — o molde abstract+impls+barrel
- `packages/api/typescript/core/src/types/Registry.ts` — `registerAll`/`expandBindings`, e por que `useFactory` é transiente
- `packages/api/typescript/core/src/db/drivers/{DrizzleDatabaseDriver.ts,LibsqlDriver.ts}` — `db`, `readMigrations(): {applied,pending}`
- `packages/api/typescript/core/src/utils/TryCatch.ts` — `tryCatchAsync`

**Agent:** backend-developer · **Reviewer:** spec-compliance-reviewer → code-reviewer · **Model:** opus · **Skills:** /service, /test
**Depends on:** (none)
**Scope fence:** DONE: os 6 artefatos de core, o barrel, o export e os DOIS getters de core. OUT: `src/` inteiro (T2), `DrizzleMailboxDispatcher` (vive em `src/agent/`, T2), qualquer binding em registry (T2), qualquer controller. Estes arquivos nascem **MORTOS** — nada em `src/` os importa ao fim da Task, e isso é intencional. Nada aqui importa de `src/`, de `packages/contracts` ou da SDK.
**Gate:** `cd packages/api/typescript/core && bun test src/services/HealthService` (exit 0) · `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` (exit 0) · `cd packages/api/typescript && bun test` (exit 0) · `bun lint` (exit 0) · `grep -rn "src/" core/src/services/HealthService` → vazio

### Step T1.1 — RED primeiro: a ESPIGA do multi-inject

Escrever `HealthService.test.ts` **antes** dos artefatos. O primeiro `describe` não testa nada do nosso código — testa o CONTAINER, porque decisão 3 é o primeiro uso do mecanismo no repo e todo o resto se empilha nele.

```ts
import 'reflect-metadata'
import { describe, expect, it } from 'bun:test'
import { container } from 'tsyringe-neo'
import { HEALTH_CHECKS, HealthCheck, healthChecksFrom, type HealthComponentReport } from './HealthCheck'
import { HealthService } from './HealthService'

class FakeCheck extends HealthCheck {
	constructor(
		readonly name: string,
		readonly gate: boolean,
		private readonly report: HealthComponentReport,
	) {
		super()
	}
	async check(): Promise<HealthComponentReport> {
		return this.report
	}
}

const up = (gate: boolean): HealthComponentReport => ({ status: 'up', gate })
const down = (gate: boolean): HealthComponentReport => ({ status: 'down', gate, detail: 'forced' })

describe('multi-inject em tsyringe-neo — a ESPIGA (primeiro uso no repo)', () => {
	it('N register() no MESMO token voltam TODOS por resolveAll, na ordem de registro', () => {
		const c = container.createChildContainer()
		c.register(HEALTH_CHECKS, { useFactory: () => new FakeCheck('a', true, up(true)) })
		c.register(HEALTH_CHECKS, { useFactory: () => new FakeCheck('b', true, up(true)) })
		expect(c.resolveAll<HealthCheck>(HEALTH_CHECKS).map(x => x.name)).toEqual(['a', 'b'])
		// E o resolve() singular devolve o ÚLTIMO — a razão pela qual NADA resolve este token no singular.
		expect((c.resolve(HEALTH_CHECKS) as HealthCheck).name).toBe('b')
	})

	it('O TOKEN É STRING porque um token de CLASSE ABSTRATA falha em silêncio', () => {
		const c = container.createChildContainer()
		// String: lança com o nome do token.
		expect(() => c.resolveAll<HealthCheck>(HEALTH_CHECKS)).toThrow(/unregistered dependency token/)
		// Classe abstrata: NÃO lança — CONSTRÓI a abstrata e devolve uma instância sem métodos.
		// (o mesmo footgun que shared/registry.ts:174-176 documenta). Este assert existe para que
		// trocar o token por HealthCheck fique VERMELHO em vez de silenciosamente degradado.
		const ghosts = c.resolveAll<HealthCheck>(HealthCheck as never)
		expect(ghosts).toHaveLength(1)
		expect(ghosts[0]!.name).toBeUndefined()
	})

	it('container FILHO sombreia o pai — por isso todo check cai no MESMO container', () => {
		const parent = container.createChildContainer()
		parent.register(HEALTH_CHECKS, { useFactory: () => new FakeCheck('parent', true, up(true)) })
		const child = parent.createChildContainer()
		child.register(HEALTH_CHECKS, { useFactory: () => new FakeCheck('child', true, up(true)) })
		expect(child.resolveAll<HealthCheck>(HEALTH_CHECKS).map(x => x.name)).toEqual(['child'])
	})

	it('healthChecksFrom devolve [] num container sem registro nenhum (nunca lança no boot)', () => {
		expect(healthChecksFrom(container.createChildContainer())).toEqual([])
	})
})

describe('HealthService — agrega, e SÓ gate reprova', () => {
	it('todos up ⇒ ready, com um componente por check', async () => {
		const svc = new HealthService([new FakeCheck('db', true, up(true)), new FakeCheck('channel', false, up(false))])
		const report = await svc.report()
		expect(report.ready).toBe(true)
		expect(Object.keys(report.components).sort()).toEqual(['channel', 'db'])
	})

	it('FALSEADOR — um check de GATE down reprova; um check de DIAGNÓSTICO down não', async () => {
		const gateDown = new HealthService([new FakeCheck('db', true, down(true))])
		expect((await gateDown.report()).ready).toBe(false)

		const diagDown = new HealthService([new FakeCheck('db', true, up(true)), new FakeCheck('channel', false, down(false))])
		const report = await diagDown.report()
		expect(report.ready).toBe(true)
		expect(report.components.channel!.status).toBe('down')
	})

	it('um check que LANÇA vira componente down, nunca uma exceção que escapa', async () => {
		class Exploding extends HealthCheck {
			readonly name = 'boom'
			readonly gate = true
			async check(): Promise<HealthComponentReport> {
				throw new Error('nope')
			}
		}
		const report = await new HealthService([new Exploding()]).report()
		expect(report.ready).toBe(false)
		expect(report.components.boom!.detail).toContain('nope')
	})
})
```

- [ ] `bun test src/services/HealthService` → **VERMELHO** com `Cannot find module './HealthCheck'` (nenhum artefato existe ainda)

### Step T1.2 — Proposed file: Create `core/src/services/HealthService/HealthCheck.ts`

```ts
import type { DependencyContainer } from 'tsyringe-neo'

/**
 * READINESS DE BOOT, componente a componente — o cidadão de framework que faltava ao lado de
 * `Controller`, `Middleware` e `OutboxDispatcher`.
 *
 * A pergunta que um `HealthCheck` responde NÃO é "esse serviço funciona", é "esse processo terminou
 * de subir". Quem consome é o supervisor da shell (que decide revelar a janela) e, no futuro, um
 * painel de diagnóstico — os dois querem o MESMO shape por componente.
 */
export type HealthStatus = 'up' | 'down'

export interface HealthComponentReport {
	status: HealthStatus
	/** Reprovar aqui reprova a prontidão do processo. `false` = diagnóstico puro. */
	gate: boolean
	/** Texto curto para humano: contagem de migrações pendentes, status do canal, mensagem de erro. */
	detail?: string
}

export interface HealthReport {
	ready: boolean
	components: Record<string, HealthComponentReport>
}

export abstract class HealthCheck {
	/** Chave do componente no payload (`db`, `migrations`, `outboxDispatcher`, …). */
	abstract readonly name: string
	/**
	 * GATE (`true`) reprova a prontidão; DIAGNÓSTICO (`false`) nunca reprova, aconteça o que
	 * acontecer com o `status`. A distinção é declarada aqui e não no agregador porque quem sabe se
	 * um componente é precondição de boot é o dono do componente.
	 */
	abstract readonly gate: boolean
	abstract check(): Promise<HealthComponentReport>
}

/**
 * Porta estrutural de "meu timer de poll está rodando".
 *
 * Estrutural (interface) e não membro das classes abstratas de propósito: `OutboxDispatcher`,
 * `ExternalMediator` e `MailboxDispatcher` têm mocks e spies que não têm timer nenhum, e obrigá-los a
 * declarar um `running` fabricado seria inventar estado para satisfazer um tipo. Só a implementação
 * REAL — a que tem timer — implementa isto.
 */
export interface PollingService {
	readonly running: boolean
}

/**
 * O TOKEN DE MULTI-INJECT — uma STRING, deliberadamente.
 *
 * Medido (HealthService.test.ts): `resolveAll` sobre um token que é CLASSE ABSTRATA não lança — ele
 * CONSTRÓI a abstrata e devolve uma instância sem métodos, o mesmo silêncio que `shared/registry.ts`
 * já documenta ter custado um boot. Com token string, o container lança nomeando o token.
 */
export const HEALTH_CHECKS = 'HealthCheck'

/**
 * Todos os checks registrados NESTE container, ou `[]` quando não há nenhum.
 *
 * A guarda existe porque os ambientes `mock`/`integration` declaram ausência (nenhum check bindado):
 * sem ela, construir o `HealthService` num teste lançaria. `true` = busca recursiva no pai.
 */
export function healthChecksFrom(container: DependencyContainer): HealthCheck[] {
	if (!container.isRegistered(HEALTH_CHECKS, true)) return []
	return container.resolveAll<HealthCheck>(HEALTH_CHECKS)
}
```

### Step T1.3 — Proposed file: Create `core/src/services/HealthService/HealthService.ts`

```ts
import { tryCatchAsync } from '../../utils/TryCatch'
import type { HealthCheck, HealthComponentReport, HealthReport } from './HealthCheck'

/**
 * Agrega os `HealthCheck` registrados num único veredito + um componente por check.
 *
 * Não é `@injectable()`: o composition root o binda por `useFactory` porque a lista de checks vem de
 * `resolveAll` (multi-inject), que não é expressável por injeção-por-tipo. Ver `shared/registry.ts`.
 */
export class HealthService {
	constructor(private readonly checks: readonly HealthCheck[]) {}

	async report(): Promise<HealthReport> {
		const entries = await Promise.all(
			this.checks.map(async check => {
				// Um check que LANÇA é um componente down, nunca um 500 no endpoint de health: o
				// operador precisa saber QUAL componente quebrou, e um stack trace no lugar do payload
				// é a pior resposta possível para "por que o app não abre".
				const outcome = await tryCatchAsync(async () => check.check())
				const component: HealthComponentReport = outcome.success
					? outcome.data
					: { status: 'down', gate: check.gate, detail: String(outcome.error) }
				return [check.name, component] as const
			}),
		)
		const components = Object.fromEntries(entries)
		const ready = entries.every(([, component]) => !component.gate || component.status === 'up')
		return { ready, components }
	}
}
```

### Step T1.4 — Proposed file: Create os três checks genéricos

`DatabaseHealthCheck.ts`:

```ts
import { sql } from 'drizzle-orm'
import { DrizzleDatabaseDriver } from '../../db/drivers/DrizzleDatabaseDriver'
import { tryCatchAsync } from '../../utils/TryCatch'
import { HealthCheck, type HealthComponentReport } from './HealthCheck'

/** GATE — `SELECT 1` na conexão de LEITURA do driver (`driver.db`), a mesma que todo BFF usa. */
export class DatabaseHealthCheck extends HealthCheck {
	readonly name = 'db'
	readonly gate = true

	constructor(private readonly driver: DrizzleDatabaseDriver) {
		super()
	}

	async check(): Promise<HealthComponentReport> {
		const outcome = await tryCatchAsync(async () => {
			await this.driver.db.run(sql`SELECT 1`)
		})
		return outcome.success ? { status: 'up', gate: true } : { status: 'down', gate: true, detail: String(outcome.error) }
	}
}
```

`MigrationsHealthCheck.ts`:

```ts
import { DrizzleDatabaseDriver } from '../../db/drivers/DrizzleDatabaseDriver'
import { tryCatchAsync } from '../../utils/TryCatch'
import { HealthCheck, type HealthComponentReport } from './HealthCheck'

/**
 * GATE — nenhuma migração pendente no ledger compartilhado `_sqlite_migrations`.
 *
 * É o check que a docblock de `note_ready` (shell Rust) descreve ter faltado: "the shell painted the
 * console the moment the webview existed, while the daemon was still applying migrations".
 */
export class MigrationsHealthCheck extends HealthCheck {
	readonly name = 'migrations'
	readonly gate = true

	constructor(private readonly driver: DrizzleDatabaseDriver) {
		super()
	}

	async check(): Promise<HealthComponentReport> {
		const outcome = await tryCatchAsync(async () => this.driver.readMigrations())
		if (!outcome.success) return { status: 'down', gate: true, detail: String(outcome.error) }
		const { applied, pending } = outcome.data
		if (pending.length > 0) {
			return { status: 'down', gate: true, detail: `${pending.length} pending: ${pending.join(', ')}` }
		}
		return { status: 'up', gate: true, detail: `${applied.length} applied` }
	}
}
```

`PollingHealthCheck.ts`:

```ts
import { HealthCheck, type HealthComponentReport, type PollingService } from './HealthCheck'

/**
 * GATE — o timer de poll do serviço está armado.
 *
 * Um por dispatcher, com o nome do componente vindo do call site (o core não conhece os nomes do
 * produto). O sinal é lido do próprio serviço (`PollingService.running`) — ver o docblock de cada
 * `running` para POR QUE aquele campo e não outro.
 */
export class PollingHealthCheck extends HealthCheck {
	readonly gate = true

	constructor(
		readonly name: string,
		private readonly service: PollingService,
	) {
		super()
	}

	async check(): Promise<HealthComponentReport> {
		return this.service.running ? { status: 'up', gate: true } : { status: 'down', gate: true, detail: 'poll timer not running' }
	}
}
```

`index.ts`:

```ts
export * from './HealthCheck'
export * from './HealthService'
export * from './DatabaseHealthCheck'
export * from './MigrationsHealthCheck'
export * from './PollingHealthCheck'
```

### Step T1.5 — Os dois getters de core (edição pontual)

- [ ] `DrizzleOutboxDispatcher.ts` — logo abaixo dos campos privados, um getter `get running(): boolean { return this.timer !== null }` com docblock citando POR QUE `timer` e não `stopping` (D-B), e `implements PollingService` na declaração da classe
- [ ] `SqlExternalMediator.ts` — idem, `get running(): boolean { return !this.stopped }`, docblock citando que `stopped` nasce `true`, e `implements PollingService`

### Step T1.6 — Verde e os números

- [ ] `cd packages/api/typescript/core && bun test src/services/HealthService` → **8 pass / 0 fail**
- [ ] `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` → exit 0
- [ ] `cd packages/api/typescript && bun test` → exit 0 (nenhuma suíte existente toca os getters novos)
- [ ] `bun tsc` (raiz) e `bun lint` → exit 0
- [ ] `grep -rn "HealthCheck\|HealthService" packages/api/typescript/src` → **vazio** (nasce morto, de propósito)

### Step T1.7 — Commit

```bash
git add packages/api/typescript/core/src/services/HealthService \
        packages/api/typescript/core/src/index.ts \
        packages/api/typescript/core/src/services/OutboxDispatcher/DrizzleOutboxDispatcher.ts \
        packages/api/typescript/core/src/services/Mediator/SqlExternalMediator.ts
git commit -m "feat(core): B1 T1 — HealthCheck vira cidadao do core, com o multi-inject provado

O multi-inject de tsyringe-neo e o primeiro uso no repo, entao ele e provado por
espiga ANTES de qualquer check ser empilhado nele. A espiga achou o motivo do
token ser string: resolveAll sobre uma CLASSE ABSTRATA nao lanca — constroi a
abstrata e devolve uma instancia sem metodos, o mesmo silencio que ja custou um
boot (shared/registry.ts). Container filho sombreia o pai, entao todo check cai
no mesmo container.

Os getters running usam o menor sinal VERDADEIRO que ja existia: !stopped no
SqlExternalMediator (nasce true), timer!==null no OutboxDispatcher (stopping
nasce false e mentiria antes do start). Zero campo novo, zero membro nas
abstratas — a porta e estrutural, entao mock e spy ficam intocados.

Nasce morto. T2 o consome."
```

---

## Task T2: `GET /v1/health` público no daemon TS — e a SDK ganha a operação tipada

**Files to write:**
- Create: `packages/api/typescript/src/shared/services/ChannelStatusHealthCheck/ChannelStatusHealthCheck.ts` — o diagnóstico do canal (nunca gate)
- Create: `packages/api/typescript/src/shared/services/ChannelStatusHealthCheck/index.ts`
- Create: `packages/api/typescript/src/shared/controllers/Health.ts` — o controller público
- Create: `packages/api/typescript/src/shared/controllers/Health.test.ts` — os falseadores US-1/US-2/US-3 + AC-1
- Modify: `packages/api/typescript/src/shared/services/index.ts` — uma linha de re-export
- Modify: `packages/api/typescript/src/shared/controllers/index.ts` — uma linha (`export { HealthController } from './Health'`), exigida pela rail WIRE-03
- Modify: `packages/api/typescript/src/shared/index.ts` — `controllers: { HealthController, ...testControllers }` (o mapa hoje é só `testControllers`)
- Modify: `packages/api/typescript/src/shared/registry.ts` — 6 declarações novas (`HealthService` + 5 `HEALTH_CHECKS`), `mock: null, integration: null` nos checks
- Modify: `packages/api/typescript/src/agent/registry.ts` — 1 declaração (`HEALTH_CHECKS` do `mailboxDispatcher`, que é do contexto que o possui)
- Modify: `packages/api/typescript/src/agent/services/MailboxDispatcher/DrizzleMailboxDispatcher.ts` — um getter `running` + `implements PollingService` (edição pontual)
- Modify (GERADO, commitar): `packages/api/typescript/public/docs/openapi.json`, `packages/client/dist/typescript/src/**`, `packages/client/dist/rust/src/typescript/mod.rs` — exatamente o que `bun sdk` escrever

**Files to read:**
- `packages/api/typescript/src/agent/controllers/DetectProviders.test.ts` — o padrão de teste de controller (constrói e chama `executeController`, assere no `Response` real)
- `packages/api/typescript/src/shared/controllers/TestIngressController.ts` — o único controller do contexto root hoje
- `packages/api/typescript/src/thread/services/ChannelConnectivity/DrizzleChannelConnectivity.ts` — como o TS lê a tabela `gateway_channels` (read model do Go)
- `packages/api/typescript/src/shared/registry.ts:130-200` — o formato das `BindingDecl` e o carve-out `EMIT_OPENAPI`
- `packages/api/typescript/core/src/types/Controller.ts:186-196` — a condição exata de `effectiveMiddlewares`

**Agent:** backend-developer · **Reviewer:** spec-compliance-reviewer → code-reviewer · **Model:** opus · **Skills:** /controller, /service, /test, /sdk
**Depends on:** T1
**Scope fence:** DONE: o controller, o check de canal, o getter do mailbox, os 7 bindings, a barra WIRE-03, e a regeneração de openapi TS + SDK TS/Rust. OUT: qualquer coisa em Go (T3), qualquer coisa em `src-tauri` (T4/T5), qualquer middleware (o controller NÃO declara nenhum — é o ponto). Não tocar `packages/contracts` (nenhum enum ou evento novo).
**Gate:** `cd packages/api/typescript && bun test src/shared/controllers/Health.test.ts` (exit 0) · `bun x tsc -p tsconfig.build.json --noEmit` (exit 0) · `bun test` do package (exit 0) · `EMIT_OPENAPI=true START_SERVER=false bun run scripts/emit-openapi.ts` (exit 0 — AC-5) · `bun tsc` raiz · `bun lint` · `bun test:tooling` · `cargo build --manifest-path packages/client/dist/rust/Cargo.toml` (exit 0) · `bun check:generated` (exit 0) · `python3 -c "import json;s=json.load(open('packages/api/typescript/public/docs/openapi.json'));print(list(s['paths']['/v1/health']['get']['responses']))"` → `['200']`

### Step T2.1 — RED primeiro: `src/shared/controllers/Health.test.ts`

```ts
import { describe, expect, it } from 'bun:test'
import type { HttpControllerRequest } from '@codedm/core-typescript'
import { HealthCheck, HealthService, type HealthComponentReport } from '@codedm/core-typescript'
import { HealthController } from './Health'

class StubCheck extends HealthCheck {
	constructor(
		readonly name: string,
		readonly gate: boolean,
		private readonly report: HealthComponentReport,
	) {
		super()
	}
	async check(): Promise<HealthComponentReport> {
		return this.report
	}
}

/** Um request CRU — sem cookie, sem header de auth, sem ctx. É a metade do AC-1 que importa. */
function anonymousRequest(): HttpControllerRequest<unknown> {
	const raw = new Request('http://localhost/v1/health')
	return { url: raw.url, ctx: {}, raw }
}

const healthy = () =>
	new HealthService([
		new StubCheck('db', true, { status: 'up', gate: true }),
		new StubCheck('migrations', true, { status: 'up', gate: true, detail: '12 applied' }),
		new StubCheck('outboxDispatcher', true, { status: 'up', gate: true }),
		new StubCheck('mailboxDispatcher', true, { status: 'up', gate: true }),
		new StubCheck('sqlExternalMediator', true, { status: 'up', gate: true }),
		new StubCheck('channel', false, { status: 'up', gate: false, detail: 'CONNECTED' }),
	])

describe('HealthController — US-1/US-2/US-3, AC-1..AC-4', () => {
	it('AC-1: nenhum middleware na cadeia — um request anônimo recebe CORPO, não 401/403', async () => {
		// A cadeia REAL: executeController → effectiveMiddlewares. `middlewares` fica no default herdado
		// e a classe NÃO declara `static mcpScopes`, então nada é auto-anexado.
		expect(new HealthController(healthy()).middlewares).toEqual([])
		expect((HealthController as unknown as { mcpScopes?: readonly string[] }).mcpScopes).toBeUndefined()

		const response = await new HealthController(healthy()).executeController(anonymousRequest())
		expect(response.status).not.toBe(401)
		expect(response.status).not.toBe(403)
	})

	it('AC-2 / US-1: tudo saudável ⇒ 200 com os cinco componentes de gate + o diagnóstico', async () => {
		const response = await new HealthController(healthy()).executeController(anonymousRequest())
		expect(response.status).toBe(200)
		const body = (await response.json()) as { status: string; components: Record<string, { status: string }> }
		expect(body.status).toBe('ok')
		expect(Object.keys(body.components).sort()).toEqual([
			'channel',
			'db',
			'mailboxDispatcher',
			'migrations',
			'outboxDispatcher',
			'sqlExternalMediator',
		])
	})

	it('FALSEADOR AC-3 / US-2: migração pendente ⇒ 503 e o componente `migrations` marcado down', async () => {
		const service = new HealthService([
			new StubCheck('db', true, { status: 'up', gate: true }),
			new StubCheck('migrations', true, { status: 'down', gate: true, detail: '1 pending: 0031_add_health.sql' }),
		])
		const response = await new HealthController(service).executeController(anonymousRequest())
		expect(response.status).toBe(503)
		const body = (await response.json()) as { status: string; components: Record<string, { status: string; detail?: string }> }
		expect(body.status).toBe('not_ready')
		expect(body.components.migrations!.status).toBe('down')
		expect(body.components.migrations!.detail).toContain('0031_add_health.sql')
		expect(body.components.db!.status).toBe('up')
	})

	it('FALSEADOR AC-3: cada um dos três dispatchers parado, isolado, reprova sozinho', async () => {
		for (const stopped of ['outboxDispatcher', 'mailboxDispatcher', 'sqlExternalMediator']) {
			const service = new HealthService(
				['outboxDispatcher', 'mailboxDispatcher', 'sqlExternalMediator'].map(
					name =>
						new StubCheck(name, true, {
							status: name === stopped ? 'down' : 'up',
							gate: true,
							detail: name === stopped ? 'poll timer not running' : undefined,
						}),
				),
			)
			const response = await new HealthController(service).executeController(anonymousRequest())
			expect(response.status, `${stopped} parado deveria reprovar`).toBe(503)
		}
	})

	it('FALSEADOR AC-4 / US-3: canal DESCONECTADO com todo o resto saudável ⇒ continua 200', async () => {
		const service = new HealthService([
			new StubCheck('db', true, { status: 'up', gate: true }),
			new StubCheck('channel', false, { status: 'up', gate: false, detail: 'DISCONNECTED' }),
		])
		const response = await new HealthController(service).executeController(anonymousRequest())
		expect(response.status).toBe(200)
		const body = (await response.json()) as { components: Record<string, { detail?: string }> }
		expect(body.components.channel!.detail).toBe('DISCONNECTED')
	})
})
```

- [ ] `bun test src/shared/controllers/Health.test.ts` → **VERMELHO**: `Cannot find module './Health'`

### Step T2.2 — Proposed file: Create `src/shared/services/ChannelStatusHealthCheck/ChannelStatusHealthCheck.ts`

```ts
import { injectable } from 'tsyringe-neo'
import { desc } from 'drizzle-orm'
import { DrizzleClient, HealthCheck, type HealthComponentReport, tryCatchAsync } from '@codedm/core-typescript'
import { channels } from '@codedm/contracts/db'

/**
 * DIAGNÓSTICO — nunca gate. O WhatsApp conecta PELO app (QR na mão do operador), então "canal
 * desconectado" é o estado normal de um boot limpo, não uma falha de boot. `gate = false` e
 * `status` FIXO em `'up'` são a expressão mais forte disso: nem uma leitura que falha derruba o
 * endpoint, ela só vira `detail`.
 *
 * Lê a tabela de read-model `gateway_channels` (escrita só pelos projetores do gateway Go) pela
 * conexão de leitura, como `DrizzleChannelConnectivity` já faz — sem ownerId, porque `/v1/health` é
 * público e o dado é status de processo, não conteúdo de tenant.
 */
@injectable()
export class ChannelStatusHealthCheck extends HealthCheck {
	readonly name = 'channel'
	readonly gate = false

	constructor(private readonly db: DrizzleClient) {
		super()
	}

	async check(): Promise<HealthComponentReport> {
		const outcome = await tryCatchAsync(async () => {
			const rows = await this.db.select({ status: channels.status }).from(channels).orderBy(desc(channels.updatedAt)).limit(1)
			return rows[0]?.status ?? 'NONE'
		})
		return {
			status: 'up',
			gate: false,
			detail: outcome.success ? String(outcome.data) : `unreadable: ${String(outcome.error)}`,
		}
	}
}
```

`index.ts`: `export * from './ChannelStatusHealthCheck'`

### Step T2.3 — Proposed file: Create `src/shared/controllers/Health.ts`

```ts
import { injectable } from 'tsyringe-neo'
import { Controller, HealthService, HttpStatusCode, z } from '@codedm/core-typescript'

export const HealthInputSchema = z.object({})

export const HealthComponentSchema = z.object({
	status: z.enum(['up', 'down']),
	/** `true` = reprovar aqui reprova a prontidão. `false` = diagnóstico (canal WhatsApp). */
	gate: z.boolean(),
	detail: z.string().optional(),
})

export const HealthOutputSchema = z.object({
	status: z.enum(['ok', 'not_ready']),
	components: z.record(z.string(), HealthComponentSchema),
})

/**
 * O PRIMEIRO CONTROLLER PÚBLICO DO REPO, e a ausência de `middlewares` é a decisão, não um
 * esquecimento.
 *
 * Todo outro controller declara `override middlewares = [OperatorMiddleware]`. Este não pode: quem
 * pergunta se o daemon subiu é o supervisor da shell, ANTES de existir qualquer sessão — exigir
 * identidade para responder "eu terminei de subir" é exigir que o app esteja pronto para descobrir
 * se ele está pronto. Mecanicamente: `middlewares` fica no default `[]` herdado de `Controller`, e a
 * classe NÃO declara `static mcpScopes`, então `Controller.effectiveMiddlewares` devolve a lista
 * declarada intacta (a auto-aplicação de `AgentIdentityMiddleware` é condicionada a `mcpScopes`
 * não-vazio). Um `static mcpScopes` aqui também seria errado por outro motivo: readiness de processo
 * não é ferramenta de modelo.
 *
 * 503 e não 200-com-status-no-corpo: o consumidor primário é um probe, e o predicado que ele usa é o
 * código HTTP. O payload é o mesmo nos dois casos — quem está down aparece marcado, sempre.
 */
@injectable()
export class HealthController extends Controller<typeof HealthInputSchema, typeof HealthOutputSchema> {
	readonly path = '/health'
	readonly method = 'get' as const
	readonly description = 'Readiness do daemon: banco, migrações e os timers de poll (canal WhatsApp entra só como diagnóstico)'
	readonly inputSchema = HealthInputSchema
	readonly outputSchema = HealthOutputSchema

	constructor(private readonly health: HealthService) {
		super()
	}

	async handle(_request: this['input']): Promise<this['output']> {
		const report = await this.health.report()
		return {
			status: report.ready ? HttpStatusCode.OK : HttpStatusCode.SERVICE_UNAVAILABLE,
			data: { status: report.ready ? 'ok' : 'not_ready', components: report.components },
		}
	}
}
```

### Step T2.4 — O getter do mailbox (edição pontual)

- [ ] `DrizzleMailboxDispatcher.ts` — `implements PollingService` + getter com docblock explicando que `start()` chama `void this.tick()`, então `timer` fica `null` durante toda a varredura de boot e `draining` é o que cobre essa janela:
  `get running(): boolean { return this.timer !== null || this.draining !== null }`

### Step T2.5 — Os 7 bindings

Em `src/shared/registry.ts`, no `CORE_REGISTRY`, logo abaixo do bloco de `CommandQueue` (mesma prateleira de seam de processo):

```ts
// HEALTH — multi-inject: N declarações do MESMO token, agregadas por resolveAll (core
// healthChecksFrom). `mock`/`integration` são ausência DECLARADA: os testes de health constroem
// HealthService à mão (Health.test.ts), e registrar checks reais num container de teste só criaria
// um segundo caminho, pior, para provar a mesma coisa.
{ token: HealthService, mock: healthServiceFactory, integration: healthServiceFactory, real: healthServiceFactory },
{ token: HEALTH_CHECKS, mock: null, integration: null, real: { useFactory: c => new DatabaseHealthCheck(resolveDriver(c)) } },
{ token: HEALTH_CHECKS, mock: null, integration: null, real: { useFactory: c => new MigrationsHealthCheck(resolveDriver(c)) } },
{ token: HEALTH_CHECKS, mock: null, integration: null, real: { useFactory: c => new PollingHealthCheck('outboxDispatcher', c.resolve(OutboxDispatcher as any) as DrizzleOutboxDispatcher) } },
{ token: HEALTH_CHECKS, mock: null, integration: null, real: { useFactory: c => new PollingHealthCheck('sqlExternalMediator', c.resolve(ExternalMediator as any) as SqlExternalMediator) } },
{ token: HEALTH_CHECKS, mock: null, integration: null, real: { useFactory: c => new ChannelStatusHealthCheck(c.resolve(DrizzleClient as any) as DrizzleClient) } },
```
com `const healthServiceFactory = { useFactory: (c: DependencyContainer) => new HealthService(healthChecksFrom(c)) }` no topo do arquivo, ao lado de `drizzleClient`/`unitOfWorkFactory`.

Em `src/agent/registry.ts`, uma declaração (o contexto que possui o dispatcher possui o check dele):

```ts
{ token: HEALTH_CHECKS, mock: null, integration: null, real: { useFactory: c => new PollingHealthCheck('mailboxDispatcher', c.resolve(MailboxDispatcher as any) as DrizzleMailboxDispatcher) } },
```

- [ ] Confirmar que os 6 `HEALTH_CHECKS` acabam no MESMO container: `BoundedContext.create` faz `registerAll(options.root ? container : rootContainer, …)` — todo registry de contexto vai pro `rootContainer`, e `shared` é `root: true`

### Step T2.6 — WIRE-03 e o mapa de controllers

- [ ] `src/shared/controllers/index.ts` — `export { HealthController } from './Health'` (sem isso a rail WIRE-03 fica vermelha)
- [ ] `src/shared/index.ts` — `controllers: { HealthController, ...testControllers }`; hoje é `controllers: testControllers` (só o seam de e2e, condicionado a `CODEDM_E2E`)

### Step T2.7 — Emissão + regeneração das SDKs, nesta ordem

- [ ] `bun x nx run api-typescript:emit-openapi --skip-nx-cache` → exit 0. **AC-5**: o carve-out `EMIT_OPENAPI` sobrevive porque todo `useFactory` de health é lazy e nenhum construtor de check faz I/O — o `DatabaseHealthCheck` recebe o driver inerte de arquivo temporário
- [ ] Conferir a operação: `python3 -c "import json;s=json.load(open('packages/api/typescript/public/docs/openapi.json'));o=s['paths']['/v1/health']['get'];print(o['operationId'], list(o['responses']), 'x-mcp-scope' in o)"` → `Health ['200'] False`
- [ ] `bun sdk` → regenera kubb (TS), oapi-codegen (Go) e progenitor (Rust)
- [ ] Conferir o método Rust: `grep -n "pub async fn health" packages/client/dist/rust/src/typescript/mod.rs` → 1 hit
- [ ] Conferir o tipo do record: `grep -n "components" packages/client/dist/rust/src/typescript/mod.rs | head -3` — deve materializar `additionalProperties` como mapa. Precedente medido: `InternalChannelMessageReceivedPlatformData.metadata` (open record no spec Go) virou `::serde_json::Map<::std::string::String, ::serde_json::Value>` e compila
- [ ] `cargo build --manifest-path packages/client/dist/rust/Cargo.toml` → exit 0
- [ ] `cargo test --manifest-path packages/client/dist/rust/Cargo.toml` → exit 0
- [ ] `bun check:generated` → exit 0 (cobre openapi TS + dist TS; o dist Rust NÃO é coberto — daí o `git add` explícito abaixo)

### Step T2.8 — Verde e os números

- [ ] `cd packages/api/typescript && bun test src/shared/controllers/Health.test.ts` → **5 pass / 0 fail**
- [ ] `cd packages/api/typescript && bun test` → exit 0 (inclui `tests/architecture/wiring-completeness.test.ts` WIRE-03 e `real-di-resolution.test.ts`)
- [ ] `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` → exit 0
- [ ] `bun tsc` raiz (inclui `app-react:tsc`, que depende de `client-typescript:build` — a SDK mudou) → exit 0
- [ ] `bun lint` · `bun test:tooling` → exit 0
- [ ] `cd packages/e2e && bun run test` → exit 0 (NUNCA `bun e2e`)
- [ ] `grep -rn "middlewares" packages/api/typescript/src/shared/controllers/Health.ts` → **vazio** (AC-1 por construção)

### Step T2.9 — Commit

```bash
git add packages/api/typescript/src/shared/controllers/Health.ts \
        packages/api/typescript/src/shared/controllers/Health.test.ts \
        packages/api/typescript/src/shared/controllers/index.ts \
        packages/api/typescript/src/shared/services/ChannelStatusHealthCheck \
        packages/api/typescript/src/shared/services/index.ts \
        packages/api/typescript/src/shared/index.ts \
        packages/api/typescript/src/shared/registry.ts \
        packages/api/typescript/src/agent/registry.ts \
        packages/api/typescript/src/agent/services/MailboxDispatcher/DrizzleMailboxDispatcher.ts \
        packages/api/typescript/public/docs/openapi.json \
        packages/client/dist/typescript/src \
        packages/client/dist/rust/src
git commit -m "feat(shared,agent): B1 T2 — GET /v1/health publico, e a SDK ganha a operacao tipada

O primeiro controller do repo deliberadamente sem middleware de auth: quem
pergunta se o daemon subiu e o supervisor da shell, antes de existir sessao.
Mecanicamente e o default herdado — middlewares=[] e nenhum static mcpScopes,
que e a UNICA condicao de auto-aplicacao de AgentIdentityMiddleware.

Gate: SELECT 1, migracoes pendentes e os tres timers de poll. O canal WhatsApp
entra com gate=false e status fixo em up — ele conecta PELO app, entao
desconectado e o estado normal de um boot limpo, nao uma falha de boot.

Nao-ready e 503: o consumidor primario e um probe e o predicado dele e o codigo
HTTP. O emissor declara so 200, entao o metodo gerado do progenitor devolve Err
para 503 — que e exatamente o que o probe do T4 quer.

SDK regenerada no mesmo commit: client.typescript.health() e o que o T4 chama."
```

---

## Task T3: `GET /api/health` no gateway Go — e o Go ganha o conceito de controller público

**Files to write:**
- Create: `packages/api/go/internal/shared/controllers/health.go` — o controller (endereço corrigido: **não** `core/`, ver o Ground)
- Create: `packages/api/go/internal/shared/controllers/health_test.go` — os falseadores US-4/AC-6
- Create: `packages/api/go/core/services/httprouter/httprouter_test.go` — o falseador do `Public`
- Modify: `packages/api/go/core/types/controller.go` — campo `Public bool` + docblock (edição pontual)
- Modify: `packages/api/go/core/services/httprouter/httprouter.go` — o `if !meta.Public` em volta do laço de middlewares globais (edição pontual)
- Modify: `packages/api/go/internal/shared/module.go` — um `fx.Provide(fx.Annotate(...ResultTags(group:"controllers")))` + um provider de 3 linhas
- Modify (GERADO, commitar): `packages/client/dist/rust/src/go/mod.rs` — exatamente o que `bun sdk` escrever
  (`packages/api/go/public/docs/openapi.json` é **gitignored** — `.gitignore:117` — e não entra no commit)

**Files to read:**
- `packages/api/go/internal/shared/controllers/listen_events.go` — o único controller do grupo shared hoje (`Context: ""`, provider anotado no módulo)
- `packages/api/go/internal/channel/controllers/get_channel.go` — o shape completo de um controller Go (Metadata + Handle + `var _ types.Controller`)
- `packages/api/go/core/services/httprouter/httprouter.go:55-92` — `RegisterControllers` vs `RegisterDocsRoutes`, o motivo do `Public`
- `packages/api/go/internal/channel/repositories/channel/sqlite_testdb_test.go` — o helper de store real em `t.TempDir()`
- `packages/api/go/pkg/openapi/{walker.go:94-124,controllers.go:40-60,schema.go:320-335}` — quem é descoberto, como o `operationId` sai, e o suporte a `map[string]T`

**Agent:** backend-developer · **Reviewer:** spec-compliance-reviewer → code-reviewer · **Model:** opus · **Skills:** /controller, /test
**Depends on:** (none — Go é independente de T1/T2; só T4 precisa dos dois)
**Scope fence:** DONE: o controller Go, o `Public`, o wiring fx, os testes e a regeneração do client Rust do serviço `go`. OUT: TS (T2), Rust shell (T4/T5), qualquer coisa em `internal/channel/` (o diagnóstico é uma leitura SQL de `gateway_channels`, não um import do contexto channel).
**Gate:** `cd packages/api/go && go build ./... && go -C core build ./...` (exit 0) · `go test ./... && go -C core test ./...` (exit 0) · `bun x nx run api-go:emit-openapi --skip-nx-cache` (exit 0) · `bun sdk` · `cargo build --manifest-path packages/client/dist/rust/Cargo.toml` (exit 0) · `bun tsc` · `bun lint` · `bun test:tooling`

### Step T3.1 — RED primeiro: `core/services/httprouter/httprouter_test.go`

O falseador do `Public`: um middleware global que reprova TUDO, e uma rota pública que passa mesmo assim.

```go
package httprouter

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"template/core-go/config"
	"template/core-go/types"
)

type stubController struct{ meta types.ControllerMetadata }

func (c *stubController) Metadata() types.ControllerMetadata { return c.meta }
func (c *stubController) Handle(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"ok":true}`))
}

// denyAll é o proxy do par Session→APIKey que internal/shared contribui ao grupo
// app_middlewares: um middleware GLOBAL que barra requisições sem credencial.
func denyAll(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	})
}

func TestGlobalMiddlewaresApplyToOrdinaryControllers(t *testing.T) {
	r := NewHttpRouter(&config.Config{})
	r.Use(denyAll)
	r.RegisterControllers([]types.Controller{
		&stubController{meta: types.ControllerMetadata{Path: "/ordinary", Method: "GET"}},
	})

	rec := httptest.NewRecorder()
	r.Handler().ServeHTTP(rec, httptest.NewRequest("GET", "/api/ordinary", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("rota comum deveria passar pela cadeia global: got %d, want 401", rec.Code)
	}
}

func TestPublicControllerBypassesGlobalMiddlewares(t *testing.T) {
	r := NewHttpRouter(&config.Config{})
	r.Use(denyAll)
	r.RegisterControllers([]types.Controller{
		&stubController{meta: types.ControllerMetadata{Path: "/health", Method: "GET", Public: true}},
	})

	rec := httptest.NewRecorder()
	r.Handler().ServeHTTP(rec, httptest.NewRequest("GET", "/api/health", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("rota publica nao pode ser barrada pela cadeia global: got %d, want 200", rec.Code)
	}
}

func TestPublicStillAppliesControllerOwnMiddlewares(t *testing.T) {
	// Public dispensa a cadeia GLOBAL, nunca a que o proprio controller declara.
	r := NewHttpRouter(&config.Config{})
	r.RegisterControllers([]types.Controller{
		&stubController{meta: types.ControllerMetadata{
			Path: "/health", Method: "GET", Public: true, Middlewares: []types.Middleware{denyAll},
		}},
	})
	rec := httptest.NewRecorder()
	r.Handler().ServeHTTP(rec, httptest.NewRequest("GET", "/api/health", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("middleware do proprio controller deve rodar mesmo em rota publica: got %d", rec.Code)
	}
}
```

- [ ] `go -C core test ./services/httprouter/...` → **VERMELHO**: `unknown field Public in struct literal of type types.ControllerMetadata`

### Step T3.2 — As duas edições pontuais no core-go

- [ ] `core/types/controller.go` — campo `Public bool` no `ControllerMetadata`, com docblock: gêmeo Go da decisão 1 do B1; a única rota que hoje escapa da cadeia global (`/api/openapi.json`) escapa por registrar direto no mux, o que não é um mecanismo — isto é
- [ ] `core/services/httprouter/httprouter.go` — envolver o laço de middlewares globais em `if !meta.Public { … }`, mantendo o laço de `meta.Middlewares` fora do `if`

### Step T3.3 — RED: `internal/shared/controllers/health_test.go`

```go
package controllers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"template/core-go/db/sqlite"
)

func newStore(t *testing.T) *sqlite.SqliteStore {
	t.Helper()
	store, err := sqlite.NewSqliteStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewSqliteStore: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	return store
}

func decode(t *testing.T, rec *httptest.ResponseRecorder) HealthOutput {
	t.Helper()
	var out HealthOutput
	if err := json.NewDecoder(rec.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return out
}

func TestHealthIs200WhenSelect1Works(t *testing.T) {
	store := newStore(t)
	rec := httptest.NewRecorder()
	NewHealthController(store.DB()).Handle(rec, httptest.NewRequest("GET", "/api/health", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("AC-6: got %d, want 200", rec.Code)
	}
	out := decode(t, rec)
	if out.Components["db"].Status != "up" || !out.Components["db"].Gate {
		t.Fatalf("componente db: %+v", out.Components["db"])
	}
}

// FALSEADOR AC-6: com a conexao fechada, SELECT 1 falha e o status MUDA.
func TestHealthIsNot200WhenSelect1Fails(t *testing.T) {
	store := newStore(t)
	db := store.DB()
	_ = db.Close()

	rec := httptest.NewRecorder()
	NewHealthController(db).Handle(rec, httptest.NewRequest("GET", "/api/health", nil))
	if rec.Code == http.StatusOK {
		t.Fatal("AC-6: SELECT 1 falhando nao pode responder 200")
	}
	if decode(t, rec).Components["db"].Status != "down" {
		t.Fatal("componente db deveria estar down")
	}
}

// FALSEADOR US-4/AC-6: o estado whatsmeow NUNCA influencia o codigo HTTP.
func TestChannelStatusNeverChangesTheHttpStatus(t *testing.T) {
	store := newStore(t)
	for _, status := range []string{"CONNECTED", "DISCONNECTED", "CREATED"} {
		if _, err := store.DB().Exec(
			`INSERT INTO gateway_channels (id, owner_id, platform, name, owner_remote_id, credentials, status, created_at, updated_at, version)
			 VALUES (?,?,?,?,?,?,?,?,?,0)
			 ON CONFLICT(id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
			"ch-1", "local", "WHATSAPP", "e2e", "", "{}", status, 1, 1,
		); err != nil {
			t.Fatalf("seed %s: %v", status, err)
		}

		rec := httptest.NewRecorder()
		NewHealthController(store.DB()).Handle(rec, httptest.NewRequest("GET", "/api/health", nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("status de canal %s mudou o HTTP para %d — o gate nao pode ver o whatsmeow", status, rec.Code)
		}
		out := decode(t, rec)
		if out.Components["channel"].Gate {
			t.Fatal("componente channel nao pode ser gate")
		}
		if out.Components["channel"].Detail != status {
			t.Fatalf("diagnostico do canal: got %q, want %q", out.Components["channel"].Detail, status)
		}
	}
}
```

- [ ] `go test ./internal/shared/controllers/...` → **VERMELHO**: `undefined: NewHealthController`

### Step T3.4 — Proposed file: Create `internal/shared/controllers/health.go`

```go
package controllers

import (
	"context"
	"database/sql"
	"net/http"
	"time"

	"template/core-go/pkg/httputil"
	"template/core-go/types"
)

// HealthComponent é o veredito de UM componente. Espelha, campo a campo, o shape que o daemon TS
// publica em /v1/health — os dois backends respondem a mesma pergunta com a mesma forma, e um
// painel de diagnóstico futuro consome as duas sem tradutor.
type HealthComponent struct {
	Status string `json:"status"`
	// Gate=true reprova a prontidão. Gate=false é diagnóstico e NUNCA muda o código HTTP.
	Gate   bool   `json:"gate"`
	Detail string `json:"detail,omitempty"`
}

type HealthOutput struct {
	Status     string                     `json:"status"`
	Components map[string]HealthComponent `json:"components"`
}

// HealthController — o gêmeo Go do /v1/health do daemon.
//
// PÚBLICO por Metadata().Public: a cadeia global que internal/shared contribui (Session → APIKey)
// barraria o supervisor da shell quando CHANNEL_GLOBAL_API_KEY estiver setado, e "o app nunca abre
// porque a rota que diz se ele abriu exige credencial" é fail-closed pela razão errada. A rota que
// o supervisor pinga hoje (/api/openapi.json) já escapa da cadeia — por registrar direto no mux,
// que não é um mecanismo. Public é o mecanismo.
type HealthController struct {
	db *sql.DB
}

func NewHealthController(db *sql.DB) *HealthController {
	return &HealthController{db: db}
}

// compile-time interface check.
var _ types.Controller = (*HealthController)(nil)

func (c *HealthController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Context:     "",
		Path:        "/health",
		Method:      "GET",
		Description: "Readiness do gateway: o SQLite compartilhado responde (canal WhatsApp entra só como diagnóstico)",
		Tags:        []string{"Health"},
		Public:      true,

		Response: HealthOutput{},
		Status:   http.StatusOK,
	}
}

func (c *HealthController) Handle(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	components := map[string]HealthComponent{
		"db":      c.checkDB(ctx),
		"channel": c.channelDiagnostic(ctx),
	}

	ready := true
	for _, component := range components {
		if component.Gate && component.Status != "up" {
			ready = false
		}
	}

	status := http.StatusOK
	label := "ok"
	if !ready {
		status = http.StatusServiceUnavailable
		label = "not_ready"
	}
	httputil.RespondJSON(w, status, HealthOutput{Status: label, Components: components})
}

// GATE — o SQLite compartilhado (o MESMO arquivo que o daemon TS abre) aceita uma leitura.
func (c *HealthController) checkDB(ctx context.Context) HealthComponent {
	var one int
	if err := c.db.QueryRowContext(ctx, "SELECT 1").Scan(&one); err != nil {
		return HealthComponent{Status: "down", Gate: true, Detail: err.Error()}
	}
	return HealthComponent{Status: "up", Gate: true}
}

// DIAGNÓSTICO — nunca gate, e o Status é fixo em "up" de propósito: o WhatsApp conecta PELO app
// (QR na mão do operador), então "desconectado" é o estado normal de um boot limpo. Leitura direta
// da tabela de read-model, sem importar o contexto channel — mesma postura do middleware Session,
// que consulta authentication_sessions por SQL cru a partir de internal/shared.
func (c *HealthController) channelDiagnostic(ctx context.Context) HealthComponent {
	var status string
	err := c.db.QueryRowContext(ctx,
		`SELECT status FROM gateway_channels ORDER BY updated_at DESC LIMIT 1`,
	).Scan(&status)
	switch {
	case err == sql.ErrNoRows:
		return HealthComponent{Status: "up", Gate: false, Detail: "NONE"}
	case err != nil:
		return HealthComponent{Status: "up", Gate: false, Detail: "unreadable: " + err.Error()}
	default:
		return HealthComponent{Status: "up", Gate: false, Detail: status}
	}
}
```

### Step T3.5 — O wiring fx (edição pontual em `internal/shared/module.go`)

- [ ] Um provider de 3 linhas (`func provideHealthController(store *sqlite.SqliteStore) *sharedcontrollers.HealthController { return sharedcontrollers.NewHealthController(store.DB()) }`) e o `fx.Provide(fx.Annotate(provideHealthController, fx.As(new(types.Controller)), fx.ResultTags(\`group:"controllers"\`)))` ao lado do `ListenEventsController`

### Step T3.6 — Emissão + regeneração

- [ ] `cd packages/api/go && go build ./... && go -C core build ./...` → exit 0
- [ ] `bun x nx run api-go:emit-openapi --skip-nx-cache` → exit 0
- [ ] `python3 -c "import json;s=json.load(open('packages/api/go/public/docs/openapi.json'));o=s['paths']['/api/health']['get'];print(o['operationId'], sorted(o['responses']))"` → `Health ['200', 'default']`
- [ ] `bun sdk` → `grep -n "pub async fn health" packages/client/dist/rust/src/go/mod.rs` → 1 hit
- [ ] `cargo build --manifest-path packages/client/dist/rust/Cargo.toml && cargo test --manifest-path packages/client/dist/rust/Cargo.toml` → exit 0

### Step T3.7 — Verde e os números

- [ ] `cd packages/api/go && go test ./... && go -C core test ./...` → exit 0; `go test ./internal/shared/controllers/... ./core/services/httprouter/...` → **6 pass**
- [ ] `go vet ./... && go -C core vet ./...` → exit 0
- [ ] `bun tsc` · `bun lint` · `bun test:tooling` · `cd packages/api/typescript && bun test` → exit 0
- [ ] `cd packages/e2e && bun run test` → exit 0
- [ ] `grep -rn "internal/channel" packages/api/go/internal/shared/controllers/health.go` → **vazio** (o diagnóstico é SQL, não import de contexto)

### Step T3.8 — Commit

```bash
git add packages/api/go/internal/shared/controllers/health.go \
        packages/api/go/internal/shared/controllers/health_test.go \
        packages/api/go/internal/shared/module.go \
        packages/api/go/core/types/controller.go \
        packages/api/go/core/services/httprouter/httprouter.go \
        packages/api/go/core/services/httprouter/httprouter_test.go \
        packages/client/dist/rust/src
git commit -m "feat(shared): B1 T3 — GET /api/health no gateway, e o Go ganha controller publico

Endereco corrigido contra o codigo: o emissor OpenAPI so enxerga controller cujo
pacote casa /controllers E comeca com template/api-go/ (walker.go:106-111),
carregado de ./internal/... — um controller em core-go nao geraria operacao,
logo nao geraria metodo no client Rust, logo o probe tipado nao fecharia.

E a spec supunha que nao ha middleware global de auth no Go: ha (Session+APIKey
pelo grupo app_middlewares). A unica rota que escapa hoje, /api/openapi.json,
escapa por registrar direto no mux — o que nao e um mecanismo. Metadata().Public
e o mecanismo, e o gemeo exato do 'controller publico' do lado TS.

Gate: SELECT 1 no store compartilhado. O whatsmeow entra com gate=false e status
fixo em up; tres falseadores provam que CONNECTED/DISCONNECTED/CREATED nao mexem
um bit no codigo HTTP."
```

---

## Task T4: O supervisor proba pela SDK tipada — `probe()`, o literal e `healthPath` morrem juntos (E1 + E2)

**Files to write:**
- Modify: `packages/app/tauri/src-tauri/src/sidecars/mod.rs` — `probe()` sai, `health_path` sai, entra `service: SidecarService` e o loop async tipado (edição substancial, arquivo de 221 linhas → ver os trechos abaixo)
- Modify: `packages/app/tauri/src-tauri/src/lib.rs` — `api::manage(app.handle())` sobe para antes do laço da frota (edição pontual, uma linha movida + comentário)
- Modify: `packages/app/tauri/src-tauri/Cargo.toml` — `tokio = { version = "1", features = ["time"] }` (edição pontual; a versão já está no `Cargo.lock` como dep transitiva do tauri)
- Modify: `packages/app/tauri/src-tauri/tests/no_raw_http.rs` — a rail passa a banir também `TcpStream` e `HTTP/1.1` fora de `api/mod.rs`
- Modify: `packages/app/tauri/config/sidecars.ts` — o campo `healthPath` some da interface e das duas entradas (E2)
- Modify: `packages/app/tauri/config/generate.test.ts` — DSK-03 ganha uma asserção de que o manifesto **não** declara caminho de health

**Files to read:**
- `packages/app/tauri/src-tauri/src/api/mod.rs` — `Api::from_env`, o header de identidade, a house rule
- `packages/app/tauri/src-tauri/src/sidecars/mod.rs` (inteiro) — o que sobrevive (spawn, env, cwd, stderr, budget/cadência) e o que morre
- `packages/client/dist/rust/src/typescript/mod.rs` (o `pub async fn health`) e `.../go/mod.rs` (idem) — as assinaturas exatas
- `.specs/2026-07-30-rust-wire-and-tauri-sdk-design.md` §F7 — a DX de comando tipado (referência, NUNCA modificar)

**Agent:** backend-developer · **Reviewer:** spec-compliance-reviewer → code-reviewer · **Model:** opus · **Skills:** (nenhuma — Rust shell não tem skill)
**Depends on:** T2, T3
**Scope fence:** DONE: o probe tipado, a ordem do `manage`, a rail estendida, a morte do `healthPath`. OUT: o gate de readiness e a splash (T5) — ao fim desta Task o give-up ainda chama `note_ready`/`reveal_main_window`, exatamente como hoje, e isso é deliberado: trocar o transporte e trocar a semântica de falha no mesmo commit tornaria impossível dizer qual dos dois quebrou.
**Gate:** `cargo build --manifest-path packages/app/tauri/src-tauri/Cargo.toml` (exit 0) · `cargo test --manifest-path packages/app/tauri/src-tauri/Cargo.toml` (exit 0) · `bun desktop:generate --check` (exit 0, **sem regenerar nada** — `healthPath` não tem leitor) · `bun test:tooling` · `bun tsc` · `bun lint` · `git status --porcelain packages/app/tauri/src-tauri/tauri.conf.json` → **vazio**

### Step T4.1 — RED primeiro: a rail estendida

Em `tests/no_raw_http.rs`, um segundo `#[test]` que hoje FALHA porque `sidecars/mod.rs` contém `TcpStream`:

```rust
/// HTTP MANUAL É HTTP CRU. A rail acima pegava `reqwest`; o probe de readiness escapava dela
/// escrevendo `GET {path} HTTP/1.1\r\n…` num `std::net::TcpStream` — literalmente o que a house rule
/// do rust-wire proíbe, sobrevivendo só por predatar a SDK.
#[test]
fn hand_rolled_http_is_confined_to_the_api_module() {
    let src = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut files = Vec::new();
    rust_sources(&src, &mut files);

    let offenders: Vec<_> = files
        .iter()
        .filter(|p| !p.ends_with("api/mod.rs"))
        .filter(|p| {
            let body = std::fs::read_to_string(p).expect("read source");
            body.contains("TcpStream") || body.contains("HTTP/1.1")
        })
        .collect();

    assert!(
        offenders.is_empty(),
        "HTTP a mão fora de src/api/mod.rs — chame a operação tipada pelo api::Api: {offenders:?}"
    );
}
```

- [ ] `cargo test --manifest-path packages/app/tauri/src-tauri/Cargo.toml` → **VERMELHO**, com a mensagem citando `src/sidecars/mod.rs`

### Step T4.2 — `sidecars/mod.rs`: o que muda

Descritor — `health_path` some, entra o serviço:

```rust
/// Qual sub-client da SDK responde por este processo. É um fato da SHELL (qual binário é qual
/// serviço), não do contrato: o CAMINHO do health mora no OpenAPI e chega pelo método gerado, então
/// não há mais literal para sincronizar com `config/sidecars.ts` (spec E2).
#[derive(Clone, Copy)]
pub enum SidecarService {
    Daemon,
    Gateway,
}

pub struct Sidecar {
    name: &'static str,
    port: u16,
    service: SidecarService,
    cwd: Option<std::path::PathBuf>,
    env: Vec<(String, String)>,
}
```

O probe — a função inteira `probe()` sobre `TcpStream` é DELETADA e substituída por:

```rust
/// READINESS PELO CONTRATO. Uma chamada tipada pelo client gerado (`codedm-client-rust`), a mesma
/// porta que todo o resto da shell usa (`api::Api`, house rule pinada por tests/no_raw_http.rs).
///
/// `is_ok()` é o predicado inteiro, e é suficiente por construção: o método gerado casa
/// `200 => Ok(...)` e manda todo o resto para `Err` — inclusive o 503 que os dois endpoints de
/// health devolvem quando um gate reprova. Prontidão é o código HTTP; o payload é para humanos.
async fn probe(api: &Api, service: SidecarService) -> bool {
    match service {
        SidecarService::Daemon => api.client.typescript.health().await.is_ok(),
        SidecarService::Gateway => api.client.go.health().await.is_ok(),
    }
}
```

O laço — `spawn_blocking` vira `spawn`, `std::thread::sleep` vira `tokio::time::sleep`, budget e cadência intactos:

```rust
    // Bootstrap health-check: 60s de budget, 500ms de cadência — inalterados. O que mudou é COMO se
    // pergunta: `tauri::async_runtime` não reexporta `sleep` e seu `block_on` é `Runtime::block_on`
    // (pania de dentro do runtime), então o laço é async de verdade sobre o tokio que o tauri já traz.
    let health_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let api = health_handle.state::<Api>();
        let deadline = Instant::now() + Duration::from_secs(60);
        loop {
            if probe(&api, sidecar.service).await {
                let _ = health_handle.emit("sidecar:ready", sidecar.name);
                log::info!("[{}] ready on :{}", sidecar.name, sidecar.port);
                note_ready(&health_handle, &ready, total);
                return;
            }
            if Instant::now() >= deadline {
                /* … branch de give-up inalterado nesta Task — T5 o reescreve … */
                return;
            }
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
    });
```

- [ ] Remover os `use std::io::{Read, Write}` e `use std::net::TcpStream` (o compilador aponta)
- [ ] Atualizar o docblock do módulo: a lista cross-boundary de `config/sidecars.ts` perde "health path" e passa a ser "papel do binário → chave de env da porta → receita de build"

### Step T4.3 — `lib.rs`: a ordem

- [ ] Mover `api::manage(app.handle());` para **antes** do `let fleet = …`, com o comentário explicando que `Api::from_env()` só lê env e monta um `reqwest::Client` lazy (nenhuma conexão aberta), então construí-lo cedo é gratuito e é o que elimina a corrida entre o primeiro poll e o `manage`

### Step T4.4 — E2: o resíduo de `healthPath`

- [ ] `config/sidecars.ts` — remover o campo de `SidecarManifestEntry` e das duas entradas. Grounded: `grep -rn "healthPath"` retorna 3 hits, todos neste arquivo; `generate.ts` lê só `role`/`portEnvKey`/`build` e `build-sidecars.ts` só `role`/`build`. Mantê-lo seria pior que removê-lo — editá-lo não mudaria o que a SDK chama, que é exatamente a mentira que a decisão 6 existia para matar
- [ ] `config/generate.test.ts` DSK-03 — acrescentar `expect('healthPath' in sidecar).toBe(false)` com o comentário: o caminho do probe mora no contrato desde E1; um campo de caminho aqui voltaria a ser documentação que ninguém lê
- [ ] `bun desktop:generate --check` → exit 0 **sem** regenerar (nenhuma saída muda) — e `git status --porcelain packages/app/tauri/src-tauri` deve ficar vazio para os dois JSON

### Step T4.5 — Verde e os greps

- [ ] `cargo build --manifest-path packages/app/tauri/src-tauri/Cargo.toml` → exit 0 (é ESTE comando que prova que o método tipado existe e casa — AC-7 por compilação)
- [ ] `cargo test --manifest-path packages/app/tauri/src-tauri/Cargo.toml` → exit 0, **2 pass** em `no_raw_http`
- [ ] `grep -rn "TcpStream\|HTTP/1.1\|/v1/session\|/api/openapi.json" packages/app/tauri/src-tauri/src` → **vazio** (AC-7)
- [ ] `grep -rn "health_path\|healthPath" packages/app/tauri` → **vazio**
- [ ] `git diff --stat packages/app/tauri/src-tauri/Cargo.lock` → **vazio** (tokio 1.53.1 já estava lá)
- [ ] `bun test:tooling` · `bun tsc` · `bun lint` → exit 0

### Step T4.6 — Commit

```bash
git add packages/app/tauri/src-tauri/src/sidecars/mod.rs \
        packages/app/tauri/src-tauri/src/lib.rs \
        packages/app/tauri/src-tauri/Cargo.toml \
        packages/app/tauri/src-tauri/tests/no_raw_http.rs \
        packages/app/tauri/config/sidecars.ts \
        packages/app/tauri/config/generate.test.ts
git commit -m "refactor(app-tauri): B1 T4 — o probe e a SDK tipada; o TcpStream e o healthPath morrem

O probe escrevia GET {path} HTTP/1.1 num std::net::TcpStream — exatamente o HTTP
manual que a house rule do rust-wire proibe, sobrevivendo so por predatar a SDK.
A rail no_raw_http nao o pegava porque so procurava a palavra reqwest; agora
procura TcpStream e HTTP/1.1 tambem, e o teste nasceu vermelho apontando o
arquivo.

Com o probe tipado, o caminho do health mora no contrato (emenda E2), entao o
campo SIDECARS[].healthPath e removido em vez de mantido: grep provou zero
leitores, e edita-lo nao mudaria o que a SDK chama — a mesma mentira que a
decisao 6 existia para matar.

api::manage sobe para antes da frota: Api::from_env so le env e monta um cliente
reqwest lazy, entao construi-lo cedo e gratuito e elimina a corrida com o
primeiro poll. O give-up continua fail-open nesta Task, de proposito: T5 troca a
semantica, este commit trocou so o transporte."
```

---

## Task T5: Fim do fail-open — a splash de erro com nome, stderr e retry (AC-9 / US-5)

**Files to write:**
- Create: `packages/app/tauri/src-tauri/src/sidecars/gate.rs` — `ReadinessGate`, `Reveal`, `SidecarFailure`, o ring buffer de stderr (pura, sem `tauri::AppHandle`)
- Create: `packages/app/tauri/src-tauri/src/sidecars/gate_test.rs` (ou `#[cfg(test)] mod tests` no fim de `gate.rs`) — o FALSEADOR de AC-9
- Create: `packages/app/tauri/src-tauri/src/commands/boot.rs` — `boot_failures()` e `retry_boot()`
- Create: `packages/app/react/public/boot-error.html` — a splash (HTML puro, `window.__TAURI__`)
- Modify: `packages/app/tauri/src-tauri/src/sidecars/mod.rs` — `note_ready`/`reveal_main_window` dão lugar a `apply(reveal)`; o leitor de stderr passa a alimentar o ring
- Modify: `packages/app/tauri/src-tauri/src/lib.rs` — o gate é construído e `manage`d antes da frota
- Modify: `packages/app/tauri/src-tauri/src/commands/mod.rs` — dois nomes novos no `collect_commands!`
- Modify: `packages/app/tauri/config/window.ts` — `BOOT_ERROR_FRAME` (label `boot-error`, `visible: false`, `url: 'boot-error.html'`)
- Modify: `packages/app/tauri/config/generate.ts` — `renderTauriConf` emite as DUAS janelas; `renderCapabilities` emite os DOIS labels
- Modify: `packages/app/tauri/config/generate.test.ts` — DSK-04/DSK-06 cobrem a segunda janela e o segundo label
- Modify (GERADO, commitar): `packages/app/tauri/src-tauri/tauri.conf.json`, `packages/app/tauri/src-tauri/capabilities/default.json`, `packages/app/tauri/commands/bindings.ts`

**Files to read:**
- `packages/app/tauri/config/{window.ts,capabilities.ts,generate.ts,generate.test.ts}` — como a única janela e as permissões são geradas hoje, e as rails DSK-01/04/06
- `packages/app/tauri/src-tauri/src/commands/mod.rs` — o único `specta_builder()` e o teste que exporta `bindings.ts`
- `packages/app/react/public/` + `packages/app/react/dist/client/` — a prova de que `public/` é copiado para o dist (`mockServiceWorker.js` nos dois)
- `packages/app/tauri/src-tauri/tauri.conf.json` — `withGlobalTauri: true`

**Agent:** backend-developer · **Reviewer:** spec-compliance-reviewer → code-reviewer · **Model:** opus · **Skills:** (nenhuma)
**Depends on:** T4
**Scope fence:** DONE: o gate puro + seus testes, a splash declarada e o HTML, os dois comandos, o stderr retido. OUT: qualquer backend (T2/T3), qualquer estilo elaborado na splash (é diagnóstico, não produto), qualquer rota React nova.
**Gate:** `cargo test --manifest-path packages/app/tauri/src-tauri/Cargo.toml` (exit 0) · `cargo build --manifest-path .../Cargo.toml` (exit 0) · `bun desktop:generate` e depois `bun desktop:generate --check` (exit 0) · `bun test:tooling` (DSK-01/04/06) · `bun tsc` (a react tsc vê `commands/bindings.ts` regenerado) · `bun lint` · `cd packages/e2e && bun run test`

### Step T5.1 — RED primeiro: o FALSEADOR de AC-9, como máquina de estados pura

O ponto do desenho: a decisão "qual janela revelar" sai do meio de uma task async com `AppHandle` e vira uma função que `cargo test` consegue interrogar.

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_sidecar_ready_reveals_the_main_window_exactly_once() {
        let gate = ReadinessGate::new(2);
        assert!(gate.note_ready("codedm-daemon").is_none(), "o primeiro a chegar nao revela nada");
        assert!(matches!(gate.note_ready("codedm-gateway"), Some(Reveal::Main)));
    }

    /// FALSEADOR AC-9 — o give-up NUNCA revela a janela principal.
    #[test]
    fn a_single_failure_reveals_the_error_splash_and_never_main() {
        let gate = ReadinessGate::new(2);
        gate.record_stderr("codedm-gateway", "panic: dial tcp 127.0.0.1:3032: connection refused");
        assert!(gate.note_ready("codedm-daemon").is_none());

        let reveal = gate.note_failed("codedm-gateway", "no 200 within 60s").expect("o ultimo a chegar revela");
        let failures = match reveal {
            Reveal::Main => panic!("AC-9: give-up nao pode revelar a janela principal"),
            Reveal::BootError(failures) => failures,
        };
        assert_eq!(failures.len(), 1);
        assert_eq!(failures[0].name, "codedm-gateway");
        assert_eq!(failures[0].reason, "no 200 within 60s");
        assert_eq!(failures[0].stderr, vec!["panic: dial tcp 127.0.0.1:3032: connection refused"]);
    }

    /// Nenhum caminho termina sem revelar janela: para todo par de desfechos, o ÚLTIMO a chegar
    /// devolve algum Reveal.
    #[test]
    fn the_last_arrival_always_reveals_something() {
        for (a_ok, b_ok) in [(true, true), (true, false), (false, true), (false, false)] {
            let gate = ReadinessGate::new(2);
            let first = if a_ok { gate.note_ready("a") } else { gate.note_failed("a", "boom") };
            assert!(first.is_none());
            let last = if b_ok { gate.note_ready("b") } else { gate.note_failed("b", "boom") };
            assert!(last.is_some(), "combinacao ({a_ok},{b_ok}) terminou sem revelar janela nenhuma");
            if !a_ok || !b_ok {
                assert!(matches!(last, Some(Reveal::BootError(_))), "qualquer falha manda para a splash");
            }
        }
    }

    #[test]
    fn stderr_is_retained_bounded_and_tail_first() {
        let gate = ReadinessGate::new(1);
        for i in 0..(STDERR_TAIL_LINES + 10) {
            gate.record_stderr("x", &format!("line {i}"));
        }
        let Some(Reveal::BootError(failures)) = gate.note_failed("x", "spawn failed") else {
            panic!("esperava a splash");
        };
        assert_eq!(failures[0].stderr.len(), STDERR_TAIL_LINES);
        assert_eq!(failures[0].stderr.last().unwrap(), &format!("line {}", STDERR_TAIL_LINES + 9));
    }
}
```

- [ ] `cargo test --manifest-path packages/app/tauri/src-tauri/Cargo.toml` → **VERMELHO**: `cannot find type ReadinessGate`

### Step T5.2 — Proposed file: Create `src-tauri/src/sidecars/gate.rs`

```rust
//! O GATE DE READINESS, como máquina de estados PURA.
//!
//! A regra que interessa não é "conte quantos ficaram prontos", é "quem chega por último decide QUAL
//! janela abre" — e antes disto essa decisão morava dentro de uma task async segurando um
//! `AppHandle`, onde nenhum teste conseguia interrogá-la. Aqui ela é uma função com retorno
//! inspecionável, e o fail-open que existia (`note_ready` chamado também no give-up, revelando o
//! dashboard quebrado) fica impossível de reintroduzir sem deixar um teste vermelho.

use std::collections::VecDeque;
use std::sync::Mutex;

/// Quantas linhas de stderr por sidecar a splash mostra. Cauda, não cabeça: o pânico está no fim.
pub const STDERR_TAIL_LINES: usize = 50;

/// O que um sidecar que não subiu deixa para o operador ler.
#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SidecarFailure {
    pub name: String,
    /// Por que desistimos: spawn falhou, ou nenhum 200 dentro do budget.
    pub reason: String,
    /// A cauda do stderr capturado, em ordem cronológica.
    pub stderr: Vec<String>,
}

/// Que janela revelar. Devolvido SOMENTE por quem chega por último — os anteriores recebem `None`.
#[derive(Debug)]
pub enum Reveal {
    Main,
    BootError(Vec<SidecarFailure>),
}

struct State {
    arrived: usize,
    failures: Vec<SidecarFailure>,
    stderr: Vec<(String, VecDeque<String>)>,
}

pub struct ReadinessGate {
    total: usize,
    state: Mutex<State>,
}

impl ReadinessGate {
    pub fn new(total: usize) -> Self {
        Self {
            total,
            state: Mutex::new(State { arrived: 0, failures: Vec::new(), stderr: Vec::new() }),
        }
    }

    /// Retém a cauda do stderr de um sidecar. Chamado do leitor de stderr, sempre — inclusive para
    /// processos que acabam subindo (o custo é 50 linhas e a alternativa é não ter nada para mostrar
    /// quando importa).
    pub fn record_stderr(&self, name: &str, line: &str) {
        let mut state = self.state.lock().expect("gate mutex");
        let entry = match state.stderr.iter_mut().find(|(n, _)| n == name) {
            Some(entry) => entry,
            None => {
                state.stderr.push((name.to_owned(), VecDeque::new()));
                state.stderr.last_mut().expect("just pushed")
            }
        };
        if entry.1.len() == STDERR_TAIL_LINES {
            entry.1.pop_front();
        }
        entry.1.push_back(line.to_owned());
    }

    pub fn note_ready(&self, _name: &str) -> Option<Reveal> {
        self.arrive(None)
    }

    pub fn note_failed(&self, name: &str, reason: &str) -> Option<Reveal> {
        let stderr = {
            let state = self.state.lock().expect("gate mutex");
            state
                .stderr
                .iter()
                .find(|(n, _)| n == name)
                .map(|(_, lines)| lines.iter().cloned().collect())
                .unwrap_or_default()
        };
        self.arrive(Some(SidecarFailure { name: name.to_owned(), reason: reason.to_owned(), stderr }))
    }

    /// As falhas acumuladas até agora — o que o comando `boot_failures` devolve para a splash.
    pub fn failures(&self) -> Vec<SidecarFailure> {
        self.state.lock().expect("gate mutex").failures.clone()
    }

    fn arrive(&self, failure: Option<SidecarFailure>) -> Option<Reveal> {
        let mut state = self.state.lock().expect("gate mutex");
        state.arrived += 1;
        if let Some(failure) = failure {
            state.failures.push(failure);
        }
        if state.arrived < self.total {
            return None;
        }
        // QUEM CHEGA POR ÚLTIMO DECIDE, e a decisão é binária: uma única falha manda para a splash.
        // Revelar a principal "porque a maioria subiu" é o fail-open que esta frente existe para
        // matar — um app parcialmente vivo é o que o operador não consegue diagnosticar.
        if state.failures.is_empty() {
            Some(Reveal::Main)
        } else {
            Some(Reveal::BootError(state.failures.clone()))
        }
    }
}
```

### Step T5.3 — `sidecars/mod.rs`: aplicar o `Reveal`

```rust
/// Revela a janela que o gate escolheu. Idempotente (`show()` numa janela visível é no-op).
///
/// A janela principal só aparece por `Reveal::Main`. O give-up abre a `boot-error` — declarada em
/// `tauri.conf.json` com `visible: false`, como a principal — e a principal PERMANECE oculta: um
/// dashboard que dispara queries contra portas mortas é pior que uma tela que diz o que quebrou.
fn apply(app: &tauri::AppHandle, reveal: Reveal) {
    use tauri::Manager;
    let label = match reveal {
        Reveal::Main => "main",
        Reveal::BootError(_) => "boot-error",
    };
    match app.get_webview_window(label) {
        Some(window) => {
            let _ = window.show();
            let _ = window.set_focus();
        }
        None => log::error!("janela '{label}' não existe — verifique tauri.conf.json (gerado)"),
    }
}
```

- [ ] Os três pontos de saída de `boot_sidecar` (falha de setup do spawn, falha do spawn, estouro do budget) chamam `gate.note_failed(name, reason)`; o sucesso chama `gate.note_ready(name)`; cada um faz `if let Some(reveal) = … { apply(app, reveal) }`
- [ ] O leitor de stderr passa a chamar `gate.record_stderr(log_name, &line)` além do `log::warn!` existente
- [ ] `note_ready`/`reveal_main_window` (as funções livres) são **deletadas** — o `AtomicUsize` também, o gate o substitui

### Step T5.4 — Proposed file: Create `src-tauri/src/commands/boot.rs`

```rust
//! Comandos da splash de boot. PULL, não push: a janela é criada com o app e um `app.emit` disparado
//! antes de ela carregar seria perdido, então ela PERGUNTA o que falhou no load.

use crate::sidecars::{ReadinessGate, SidecarFailure};

#[tauri::command]
#[specta::specta]
pub fn boot_failures(gate: tauri::State<'_, std::sync::Arc<ReadinessGate>>) -> Vec<SidecarFailure> {
    gate.failures()
}

/// Retry = bootar de novo. `restart()` e nada mais: os descritores de sidecar são derivados do
/// `setup` (data dir, resource dir) e retê-los só para poder re-spawnar seria inventar estado para
/// reimplementar, pior, o que o processo inteiro já faz de graça.
#[tauri::command]
#[specta::specta]
pub fn retry_boot(app: tauri::AppHandle) {
    app.restart()
}
```

### Step T5.5 — Proposed file: Create `packages/app/react/public/boot-error.html`

```html
<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<title>CodeDM — boot failed</title>
		<!--
			SPLASH DE ERRO DE BOOT. HTML puro em public/ — copiado verbatim para dist/client pelo vite
			(mesmo caminho do mockServiceWorker.js) e servido pelo dev server na raiz, então o mesmo
			arquivo serve dev e bundle. Deliberadamente FORA do console React: o console dispara
			queries da SDK no boot, contra exatamente os backends que estão mortos aqui.
			`withGlobalTauri: true` (tauri.conf.json) é o que dá window.__TAURI__ sem bundler.
		-->
		<style>
			body { margin: 0; font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; background: #17171a; color: #e6e6e6; padding: 24px 28px; }
			h1 { font: 600 15px/1.3 system-ui, sans-serif; margin: 0 0 4px; }
			p.sub { color: #9a9aa2; margin: 0 0 20px; }
			section { border: 1px solid #2b2b31; border-radius: 6px; margin-bottom: 14px; overflow: hidden; }
			header { background: #1e1e23; padding: 8px 12px; display: flex; gap: 10px; align-items: baseline; }
			header b { color: #ff7b72; }
			header span { color: #9a9aa2; }
			pre { margin: 0; padding: 10px 12px; white-space: pre-wrap; word-break: break-all; max-height: 260px; overflow: auto; color: #c9c9d1; }
			button { font: inherit; background: #2f6feb; color: #fff; border: 0; border-radius: 5px; padding: 8px 16px; cursor: pointer; }
		</style>
	</head>
	<body>
		<h1>O CodeDM não conseguiu iniciar</h1>
		<p class="sub">Um ou mais serviços não responderam dentro de 60 segundos. A janela principal foi mantida oculta de propósito.</p>
		<div id="failures"></div>
		<button id="retry" type="button">Tentar novamente</button>
		<script>
			const { invoke } = window.__TAURI__.core
			const escape = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
			invoke('boot_failures').then(failures => {
				document.getElementById('failures').innerHTML = failures
					.map(
						f => `<section><header><b>${escape(f.name)}</b><span>${escape(f.reason)}</span></header><pre>${
							f.stderr.length ? escape(f.stderr.join('\n')) : 'sem stderr capturado'
						}</pre></section>`,
					)
					.join('')
			})
			document.getElementById('retry').addEventListener('click', () => invoke('retry_boot'))
		</script>
	</body>
</html>
```

### Step T5.6 — A segunda janela entra na config GERADA

- [ ] `config/window.ts` — `export const BOOT_ERROR_FRAME = { label: 'boot-error', width: 720, height: 520, url: 'boot-error.html', visible: false, title: 'CodeDM — boot failed' } as const`, com docblock: nasce oculta como a principal; quem a revela é `Reveal::BootError`
- [ ] `config/generate.ts` `renderTauriConf` — `windows: [ {…main…}, { ...BOOT_ERROR_FRAME } ]`
- [ ] `config/generate.ts` `renderCapabilities` — `windows: [WINDOW_FRAME.label, BOOT_ERROR_FRAME.label]`, com comentário: sem o label aqui a splash não pode nem `invoke`, porque `core:default` é concedido POR JANELA
- [ ] `config/generate.test.ts` — DSK-04 ganha asserção das duas janelas (labels + `visible:false` nas duas + `url` da splash); DSK-06 ganha asserção dos dois labels
- [ ] `bun desktop:generate` → reescreve `tauri.conf.json` e `capabilities/default.json`; depois `bun desktop:generate --check` → exit 0

### Step T5.7 — Bindings e verde

- [ ] `commands/mod.rs` — `mod boot; pub use boot::*;` e `boot_failures, retry_boot` no `collect_commands!`
- [ ] `cargo test --manifest-path packages/app/tauri/src-tauri/Cargo.toml` → exit 0, **6 pass** (4 do gate + 2 de `no_raw_http`), e reescreve `packages/app/tauri/commands/bindings.ts`
- [ ] `git diff --stat packages/app/tauri/commands/bindings.ts` → mudado (esperado; o arquivo tem header `@ts-nocheck`, então a tsc do react não o tipa)
- [ ] `cargo build --manifest-path packages/app/tauri/src-tauri/Cargo.toml` → exit 0
- [ ] `bun test:tooling` (DSK-01/04/06) · `bun tsc` · `bun lint` · `cd packages/api/typescript && bun test` · `cd packages/api/go && go test ./... && go -C core test ./...` · `cd packages/e2e && bun run test` → exit 0
- [ ] `grep -rn "note_ready\|reveal_main_window\|AtomicUsize" packages/app/tauri/src-tauri/src` → **vazio**

### Step T5.8 — Commit

```bash
git add packages/app/tauri/src-tauri/src/sidecars \
        packages/app/tauri/src-tauri/src/lib.rs \
        packages/app/tauri/src-tauri/src/commands \
        packages/app/tauri/commands/bindings.ts \
        packages/app/tauri/config/window.ts \
        packages/app/tauri/config/generate.ts \
        packages/app/tauri/config/generate.test.ts \
        packages/app/tauri/src-tauri/tauri.conf.json \
        packages/app/tauri/src-tauri/capabilities/default.json \
        packages/app/react/public/boot-error.html
git commit -m "feat(app-tauri): B1 T5 — o give-up revela a splash de erro, nunca a janela principal

note_ready era chamado TAMBEM no branch de give-up, entao a janela principal
abria mesmo com um sidecar morto — fail-open, e o operador via um dashboard
quebrado em silencio. A decisao 'qual janela abre' sai de dentro de uma task
async com AppHandle e vira uma maquina de estados pura (ReadinessGate ->
Reveal::Main | Reveal::BootError), interrogavel por cargo test: quatro
falseadores, um deles varrendo as quatro combinacoes de desfecho para provar que
nenhum caminho termina sem revelar janela nenhuma.

A splash e uma SEGUNDA JANELA DECLARADA na config gerada (drift coberto por
DSK-01/04/06) e um HTML puro em react/public — deliberadamente fora do console,
que dispara queries da SDK contra os backends que acabaram de nao subir. O label
novo entra em capabilities porque core:default e concedido por janela.

O stderr, que so ia para o log, passa a ser retido num ring de 50 linhas por
sidecar e chega a splash por PULL (boot_failures), nao por evento: um emit
disparado antes da pagina carregar seria perdido. Retry e app.restart()."
```

---

## Task T6: O que sobe pro template — as skills e os docs aprendem os três padrões novos

**Files to write:**
- Modify: `.claude/skills/controller/typescript/registry.yaml` (+ `SKILL.md` se houver prosa correspondente) — entrada sancionando "controller público"
- Modify: `.claude/skills/service/typescript/registry.yaml` — `bad_practice`: serviço com ciclo de vida (`start`/`stop`) sem `HealthCheck` correspondente
- Modify: `.claude/skills/controller/go/registry.yaml` — o gêmeo Go: `Metadata().Public`
- Modify: `docs/BACKEND.md` — `HealthCheck`/`HealthService` na lista de cidadãos de infra, ao lado de `Controller`/`Middleware`/`OutboxDispatcher`; nota sobre multi-inject (token string, `resolveAll`, container filho sombreia)
- Modify: `packages/app/tauri/config/sidecars.ts` (cabeçalho) — "o que NÃO está aqui" ganha o caminho de health: mora no contrato desde E1

**Files to read:**
- `.claude/skills/controller/typescript/registry.yaml` — o formato exato de entrada (id, severidade, exemplo bom/ruim)
- `docs/BACKEND.md` — a seção de cidadãos
- `.plans/2026-07-30-b2-mcp-core-service.md` Task T9 — o precedente desta Task

**Agent:** docs-writer · **Reviewer:** spec-compliance-reviewer · **Model:** sonnet · **Skills:** (nenhuma)
**Depends on:** T1, T2, T3
**Scope fence:** DONE: skills + docs + o cabeçalho do manifesto. OUT: qualquer código de produção; qualquer teste.
**Gate:** `bun test:tooling` (inclui `scripts/skill-examples.test.ts` e `scripts/taxonomy-parity.test.ts`) · `bun lint` · `bun tsc`

### Step T6.1 — Skill `controller` (typescript): "controller público" é padrão sancionado

- [ ] Entrada nova citando: a condição exata (`middlewares` no default `[]` **e** sem `static mcpScopes`, porque é o `mcpScopes` não-vazio que auto-anexa `AgentIdentityMiddleware`), o único caso legítimo hoje (readiness), e a regra de review: ausência de `OperatorMiddleware` só passa com docblock que diz POR QUE

### Step T6.2 — Skill `service` (typescript): ciclo de vida exige `HealthCheck`

- [ ] `bad_practice`: uma classe com `start()`/`stop()` bindada em `real` sem uma declaração `HEALTH_CHECKS` correspondente. Com o exemplo bom sendo o `PollingHealthCheck('outboxDispatcher', …)` e a nota de D-B (usar o menor sinal verdadeiro que já existe, nunca um campo `started` novo)

### Step T6.3 — Skill `controller` (go): `Metadata().Public`

- [ ] Entrada explicando que a cadeia global existe (Session→APIKey via `app_middlewares`) e que `Public: true` é a ÚNICA forma sancionada de escapar dela — registrar direto no mux (como `RegisterDocsRoutes`) não é

### Step T6.4 — `docs/BACKEND.md`

- [ ] `HealthCheck`/`HealthService` entram na lista de cidadãos, com a tabela gate-vs-diagnóstico e a nota de multi-inject (os três achados da espiga)

### Step T6.5 — Commit

```bash
git add .claude/skills docs/BACKEND.md packages/app/tauri/config/sidecars.ts
git commit -m "docs(skills): B1 T6 — os tres padroes novos entram nas skills que os ensinam

Controller publico (TS e Go), 'servico com ciclo de vida sem HealthCheck' como
bad_practice, e a nota de multi-inject com os tres achados da espiga: token
string porque abstrata nao lanca, container filho sombreia o pai, resolve()
singular devolve o ultimo."
```

---

## Task T7: Artefato de fechamento — greps citados, falseadores e o mapa AC → teste

**Files to write:**
- Create: `.plans/artifacts/2026-07-30-b1-health-readiness-closure.md`

**Depends on:** T1, T2, T3, T4, T5, T6
**Scope fence:** DONE: o artefato. OUT: qualquer código.
**Gate:** a bateria completa de fechamento (abaixo), toda com saída citada no artefato.

### Step T7.1 — A bateria de fechamento, em ordem, com a saída registrada

```bash
cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit
cd packages/api/typescript && bun test
cd packages/api/typescript/core && bun test
bun tsc
bun lint
bun test:tooling
cd packages/api/go && go build ./... && go -C core build ./...
cd packages/api/go && go test ./... && go -C core test ./...
cargo build --manifest-path packages/contracts/generated/rust/Cargo.toml
cargo test  --manifest-path packages/contracts/generated/rust/Cargo.toml
cargo build --manifest-path packages/client/dist/rust/Cargo.toml
cargo test  --manifest-path packages/client/dist/rust/Cargo.toml
cargo build --manifest-path packages/app/tauri/src-tauri/Cargo.toml
cargo test  --manifest-path packages/app/tauri/src-tauri/Cargo.toml
bun desktop:generate --check
cd packages/e2e && bun run test        # NUNCA `bun e2e`
bun check:generated                    # PÓS-COMMIT
```

### Step T7.2 — O mapa AC → teste, com os falseadores nomeados

| AC | Onde é provado | Falseador (o que fica vermelho se a invariante cair) |
|---|---|---|
| AC-1 | `src/shared/controllers/Health.test.ts` | `middlewares` não-vazio, ou um `static mcpScopes` na classe |
| AC-2 | idem | uma chave a menos em `components` |
| AC-3 | idem (2 testes) | migração pendente devolvendo 200; cada dispatcher parado isoladamente |
| AC-4 | idem | canal DISCONNECTED mudando o código HTTP |
| AC-5 | Step T2.7 (`emit-openapi` exit 0) | um `HealthCheck` que faça I/O no construtor |
| AC-6 | `internal/shared/controllers/health_test.go` (3 testes) | `SELECT 1` falhando com 200; qualquer status de canal mexendo no HTTP |
| AC-7 | `tests/no_raw_http.rs` + `cargo build` | qualquer `TcpStream`/`HTTP/1.1` fora de `api/mod.rs`; o literal de path voltando |
| AC-8 | **SUPERSEDIDO por E2** — substituído por: `grep -rn "healthPath" packages/app/tauri` vazio + DSK-03 | o campo voltar ao manifesto |
| AC-9 | `src-tauri/src/sidecars/gate.rs` (4 testes) | `Reveal::Main` com qualquer falha; um desfecho que devolve `None` no último a chegar |

### Step T7.3 — Commit

```bash
git add .plans/artifacts/2026-07-30-b1-health-readiness-closure.md
git commit -m "docs(plans): B1 — artefato de fechamento (greps citados + falseadores + mapa AC->teste)"
```
