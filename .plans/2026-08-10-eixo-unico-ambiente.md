# O Eixo Único de Ambiente — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox (`- [ ]`) syntax for tracking.
> Each Task wraps one observable behavior in an outer RED→GREEN cycle. Os blocos de código são a
> forma final INTENCIONAL, mas nomes de exports do core devem ser verificados contra o código real —
> ajuste a FIAÇÃO, nunca o contrato congelado, e registre todo ajuste no relato.

**Goal:** Um único eixo de ambiente declarado (`mock/integration/real/e2e`) e uma única função de boot (`start({env, port})`) herdada por produção, harness do console e e2e; registry declarativo; givens completos com tipos derivados; fronteira do Go falhando alto.

**Architecture:** O eixo ganha a coluna `e2e` no kernel (`expandBindings`, cadeia de fallback e2e→integration→real) e a seleção por processo via `Config.env.CODM_ENV`. O boot inteiro vira `start()` em `src/server.ts` devolvendo `{url, container, stop()}`; `index.ts` e `/testing` viram cascas. O registry troca fiação imperativa (singletons de módulo, useFactory de projeção, factory de logging, flag CODM_E2E) por declaração (classes e colunas). A superfície `/testing` exporta o catálogo completo de givens tipado por `.d.ts` achatado commitado com gate de frescor.

**Tech Stack:** TypeScript, Bun, Drizzle, tsyringe-neo, Zod, Playwright

**Spec:** .specs/2026-08-10-eixo-unico-ambiente-design.md
**Tasks:** 9
**Estimated minutes:** 285

**Convenção de commit desta frente:** cada Task commita ao fechar (ondas coesas). Nada de commit gigante único — o boot de produção é caminho crítico e o diff precisa ser revisável por onda.

---

## Task T1: A coluna `e2e` existe, é selecionável e tem fallback declarado

**Files to write:**
- Modify: `packages/api/typescript/core/src/types/Registry.ts` — `BindingDecl` ganha coluna opcional `e2e`; `InstanceRegistry` ganha array `e2e`; `expandBindings` aplica a cadeia `e2e → integration → real`
- Modify: `packages/api/typescript/core/src/types/BoundedContext.ts` — `'e2e'` entra em `BoundedContextEnvironment`; novo helper exportado `byEnvironment`; a recusa "não-real sob NODE_ENV=production" cobre `e2e` (já cobre por ser não-real — verificar e afirmar no teste)
- Modify: `packages/api/typescript/core/src/utils/Config.ts` — `RawEnvSchema` ganha `CODM_ENV: z.enum(['real', 'e2e']).default('real')`, `CODM_PROFILE: z.string().default('')`, `EMIT_OPENAPI: z.string().default('')`
- Test: `packages/api/typescript/core/src/types/BoundedContext.environment.test.ts` — casos novos
- Test: `packages/api/typescript/core/src/types/Registry.test.ts` — fallback da coluna (criar se não existir; se existir, estender)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** (none)

### Step T1.1 — Testes que falham

No `BoundedContext.environment.test.ts` (arquivo existe — estender, preservando os 3 casos atuais):

```typescript
it('e2e é selecionável e lida de volta', () => {
	setBoundedContextEnvironment('e2e')
	expect(getBoundedContextEnvironment()).toBe('e2e')
})

it('FALSEADOR: e2e sob NODE_ENV=production é recusado, alto', () => {
	// Mesma técnica do falseador de integration já presente no arquivo — reusar o setup dele.
})

it('byEnvironment devolve a coluna do ambiente selecionado, com default', () => {
	setBoundedContextEnvironment('e2e')
	expect(byEnvironment({ default: 'a', e2e: 'b' })).toBe('b')
	setBoundedContextEnvironment('real')
	expect(byEnvironment({ default: 'a', e2e: 'b' })).toBe('a')
})
```

No teste de Registry: `expandBindings([{ token: X, real: A, e2e: B }])` → `e2e` contém B; sem coluna `e2e` → `e2e` espelha a resolução de `integration` (que por sua vez espelha `real` quando omitida). Declared null (`e2e: null`) → ausente.

### Step T1.2 — Rodar e ver falhar

Run: `cd packages/api/typescript && bun test core/src/types/`
Expected: FAIL (`'e2e'` não é assignable; `byEnvironment` não existe)

### Step T1.3 — Implementação

Em `Registry.ts` (o arquivo é pequeno — a mudança é local a `expandBindings` e aos tipos):

```typescript
// BindingDecl ganha: e2e?: BindingValue | null
// InstanceRegistry: { mock: [], integration: [], real: [], e2e: [] }
// Dentro do loop de expandBindings, após a linha do fallback de integration:
const integration = decl.integration === undefined ? decl.real : decl.integration
const e2e = decl.e2e === undefined ? integration : decl.e2e
// ...
if (e2e !== null) registry.e2e.push(toEntry(decl.token, e2e))
```

Em `BoundedContext.ts`: `type BoundedContextEnvironment = 'mock' | 'integration' | 'real' | 'e2e'` e, junto ao seletor:

```typescript
/**
 * Dispatch declarado sobre o eixo (NN-5): edge case por ambiente vira coluna preenchida,
 * nunca `if (process.env.X)`. Consumidores: montagem de controllers de teste
 * (`shared/index.ts`, `agent/index.ts`).
 */
export function byEnvironment<T>(columns: { default: T } & Partial<Record<BoundedContextEnvironment, T>>): T {
	return columns[getBoundedContextEnvironment()] ?? columns.default
}
```

Verificar a recusa sob production: se o guard atual testa `env !== 'real'`, `e2e` já é recusado — o teste do T1.1 vira prova. Se testa lista explícita, adicionar `'e2e'`.

Em `Config.ts`: as 3 chaves novas no `RawEnvSchema` (zod, com defaults — nenhuma quebra de boot sem env).

### Step T1.4 — Verde + gates

Run: `cd packages/api/typescript && bun test core/ && bun x tsc -p tsconfig.build.json --noEmit`
Expected: PASS, 0 erros. (`ALL_REGISTRIES`/consumidores de `InstanceRegistry` que enumeram colunas podem exigir o array `e2e` — o tsc aponta; preencher via expandBindings, nunca à mão.)

### Step T1.5 — Commit

```bash
git add packages/api/typescript/core/src/types/ packages/api/typescript/core/src/utils/Config.ts
git commit -m "feat(core): eixo de ambiente ganha a coluna e2e + byEnvironment + CODM_ENV tipado (T1)"
```

---

## Task T2: Data dir travado fala a língua da taxonomia; logging decide sozinho

**Files to write:**
- Modify: `packages/api/typescript/core/src/errors/codes.ts` — `'DATA_DIR_LOCKED'` entra em `BaseInfrastructureErrors`
- Modify: `packages/api/typescript/core/src/db/drivers/DataDirLock.ts` — `acquireDataDirLock` lança `BaseError<BaseInfrastructureErrors>('DATA_DIR_LOCKED', …)`; `class DataDirLockedError` morre; mensagem/payload preservados
- Modify: `packages/api/typescript/core/src/db/drivers/index.ts` — export da classe morta sai
- Create: `packages/api/typescript/core/src/services/Logging/DefaultLoggingService.ts`
- Modify: `packages/api/typescript/core/src/services/Logging/LoggingBinding.ts` — `createLoggingServiceFactory` morre (arquivo pode morrer inteiro se só continha o factory; o warn de boot migra pro construtor)
- Modify: `packages/api/typescript/core/src/services/Logging/index.ts` — exports
- Test: `packages/api/typescript/core/src/services/Logging/DefaultLoggingService.test.ts` (substitui `LoggingBinding.test.ts`)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /errors, /service, /test
**Depends on:** (none)

### Step T2.1 — Testes que falham

DefaultLoggingService: sem `OTEL_COLLECTOR_LOG_URL` → delega ao caminho console (asserção: comporta como `MockLoggingService`); com URL → delega ao `OtlpLoggingService` (asserção estrutural no delegate interno, sem abrir socket — mock do transporte se o construtor do Otlp abrir conexão eager). DataDirLock: o teste existente do lock ajusta a asserção de `instanceof DataDirLockedError` para `BaseError` com `code === 'DATA_DIR_LOCKED'`.

### Step T2.2 — Rodar e ver falhar, implementar, verde

```typescript
// packages/api/typescript/core/src/services/Logging/DefaultLoggingService.ts — COMPLETE final file
import { Config } from '../../utils/Config'
import { LoggingService } from './LoggingService'
import { MockLoggingService } from './MockLoggingService'
import { OtlpLoggingService } from './OtlpLoggingService'

/**
 * A ÚNICA classe que o registry declara para logging (spec D13): o construtor decide o transporte
 * pelo Config — OTLP quando `OTEL_COLLECTOR_LOG_URL` está configurado, console (MockLoggingService)
 * quando não. Substitui `createLoggingServiceFactory` + binding por useFactory: o container é dono
 * do ciclo de vida (singleton), a decisão é do construtor, o registry só declara a classe.
 */
export class DefaultLoggingService extends LoggingService {
	private readonly delegate: LoggingService

	constructor() {
		super()
		if (!Config.env.OTEL_COLLECTOR_LOG_URL) {
			console.warn('[boot] OTEL_COLLECTOR_LOG_URL is not configured — logs fall back to console only.')
			this.delegate = new MockLoggingService()
		} else {
			this.delegate = new OtlpLoggingService({ component: Config.env.OTEL_SERVICE_NAME, project: Config.project })
		}
	}
	// Delegar cada método público de LoggingService 1:1 para this.delegate — a superfície exata
	// vem da classe abstrata real (verificar assinaturas no arquivo; não inventar métodos).
}
```

Ajuste de fiação: se `LoggingService` for interface/abstract sem construtor utilizável, `implements` no lugar de `extends` — o contrato é "registry declara UMA classe".

### Step T2.3 — Gates + commit

Run: `cd packages/api/typescript && bun test core/ && bun x tsc -p tsconfig.build.json --noEmit`

```bash
git add packages/api/typescript/core/src/errors/ packages/api/typescript/core/src/db/drivers/ packages/api/typescript/core/src/services/Logging/
git commit -m "refactor(core): DATA_DIR_LOCKED na taxonomia + DefaultLoggingService declarável (T2)"
```

---

## Task T3: O driver é uma classe declarada; o registry para de fazer fiação à mão

**Files to write:**
- Create: `packages/api/typescript/src/shared/db/FileLibsqlDriver.ts`
- Modify: `packages/api/typescript/src/shared/registry.ts` — morre `getRealDatabaseDriver` + os dois singletons de módulo (`emitDriverSingleton`/`realDriverSingleton`); `migrateEmbeddedDatabase` vira wrapper de uma linha (`container.resolve` do driver → `runMigrations()` — T4 o deleta); binding do driver vira a classe (`real: FileLibsqlDriver` singleton; colunas `integration`/`mock` inalteradas); `HttpRouter` ganha `integration: FastifyHttpRouter, e2e: FastifyHttpRouter`; binding de logging `real` vira `DefaultLoggingService` (classe, sem useFactory); `resolveRealLoggingService` some
- Test: `packages/api/typescript/src/shared/registry.test.ts` — se existir, estender; senão o gate é a suíte inteira (o registry é exercitado por todos os testes `integration`)

**Files to read:**
- `packages/api/typescript/core/src/db/drivers/LibsqlDriver.ts` (assinatura do construtor — `{ schema, migrationsDir, dbPath? }`)
- `packages/api/typescript/src/shared/registry.ts` linhas 100–165 (a região exata: singletons, factories, kernel bindings, nota de memoização)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /test
**Depends on:** T1, T2
**Consumes (frozen):** `DefaultLoggingService` (T2), coluna `e2e` em `BindingDecl` (T1). NÃO tocar: tokens `DrizzleClient`/`UnitOfWorkFactory` e seus useFactory — T9 é dono da morte deles (os consumidores ainda os injetam).
**Scope fence:** OUT — `start()`/index.ts (T4); CODM_E2E (T5); a exceção sancionada `HealthService` PERMANECE useFactory (agregação via resolveAll, documentada).
**Gate:** `cd packages/api/typescript && bun test && bun x tsc -p tsconfig.build.json --noEmit` — a suíte inteira verde prova que o driver declarado migra e serve igual ao singleton de módulo que morreu.

### Step T3.1 — Proposed file

```typescript
// packages/api/typescript/src/shared/db/FileLibsqlDriver.ts — COMPLETE final file
import { join } from 'node:path'
import { Config, LibsqlDriver, resolveDataDir } from '@codm/core-typescript'
import { schema, migrationsDir } from './drizzle' // ajuste de fiação: o import real de schema/migrationsDir é o MESMO que registry.ts usa hoje — copiar dali, não inventar

/**
 * O driver `real` como CLASSE DECLARADA (spec D3): o construtor conhece a própria configuração
 * (o `super` do founder), o container é dono do ciclo de vida (singleton do registry), e o
 * carve-out EMIT_OPENAPI é decisão declarada AQUI — sob emissão o driver nasce inerte (temp file,
 * sem data dir, sem lock), porque a coleta de rotas nunca pode tocar a persistência real.
 * Substitui `getRealDatabaseDriver()` + dois singletons de escopo de módulo.
 */
export class FileLibsqlDriver extends LibsqlDriver {
	constructor() {
		super(
			Config.env.EMIT_OPENAPI === 'true'
				? { schema, migrationsDir }
				: { schema, migrationsDir, dbPath: join(resolveDataDir(Config.env.CODM_DATA_DIR), 'codm.db') },
		)
	}
}
```

### Step T3.2 — Edits no registry (descrições — arquivo grande, a Task não o possui inteiro)

1. Deletar `emitDriverSingleton`/`realDriverSingleton`/`getRealDatabaseDriver`; importar `FileLibsqlDriver`.
2. `migrateEmbeddedDatabase()` → corpo novo: `if (Config.env.EMIT_OPENAPI === 'true') return; await (rootContainer.resolve(DrizzleDatabaseDriver as any) as DrizzleDatabaseDriver).runMigrations()` — comentário: `// T4 inlina isto dentro de start() e deleta o helper`.
3. Binding do driver `real`: de `{ useFactory: () => getRealDatabaseDriver() }` para a classe `FileLibsqlDriver` (a memoização que a nota do arquivo exige passa a ser o singleton do container — atualizar a nota).
4. `HttpRouter`: colunas `integration: FastifyHttpRouter, e2e: FastifyHttpRouter`.
5. Logging `real`: `DefaultLoggingService` (classe); deletar `const resolveRealLoggingService = ...`.

### Step T3.3 — Verde + commit

Suíte inteira (1366+) verde — os testes `integration` são o RED/GREEN real desta Task: qualquer regressão de ciclo de vida do driver aparece neles.

```bash
git add packages/api/typescript/src/shared/db/FileLibsqlDriver.ts packages/api/typescript/src/shared/registry.ts
git commit -m "refactor(shared): driver como classe declarada; registry sem fiação à mão (T3)"
```

---

## Task T4: O boot é uma função; produção vira casca

**Files to write:**
- Modify: `packages/api/typescript/src/server.ts` — nasce `start(options)` + `RunningServer`; `assembleMainRouter` vira detalhe interno (mantido exportado enquanto T7 não migra o harness)
- Modify: `packages/api/typescript/src/index.ts` — casca de processo
- Modify: `packages/api/typescript/src/boot.ts` — a guarda `CODM_E2E sob production` morre (T1 provou que o seletor recusa qualquer não-real sob production); o lock fica
- Modify: `packages/api/typescript/src/shared/registry.ts` — deletar o wrapper `migrateEmbeddedDatabase` (T3 o deixou de uma linha)

**Files to read:**
- `packages/api/typescript/src/index.ts` inteiro (a coreografia + shutdown que start() absorve)
- `packages/api/typescript/tests/support/integration-server.ts` notas 4–5 (ordem migra-antes-de-importar + stop do outbox — start() precisa honrar as duas)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** T1, T3
**Consumes (frozen):** `setBoundedContextEnvironment`/`BoundedContextEnvironment` (T1), `FileLibsqlDriver` via registry (T3), `assembleMainRouter` (existente). A ordem SAGRADA (nota 4 do integration-server): selecionar env → migrar driver do env → SÓ ENTÃO `await import('./routers')`.
**Scope fence:** OUT — /testing (T7 consome start() depois); CODM_E2E sites fora do boot.ts (T5); `EMIT_OPENAPI` early-exit e cloud-profile ficam DENTRO de start() (comportamento de boot).
**Gate:** `cd packages/api/typescript && bun test && bun x tsc -p tsconfig.build.json --noEmit`; boot smoke: `CODM_DATA_DIR=$(mktemp -d) API_PORT=0 timeout 20 bun src/index.ts` sobe e loga "listening" (matar com SIGINT → drain limpo, exit 0).

### Step T4.1 — Proposed file (server.ts)

```typescript
// packages/api/typescript/src/server.ts — COMPLETE final file
// O BOOT como função (spec D1/D2): produção (index.ts), harness (/testing) e e2e herdam ESTA
// sequência. Mudar o boot é mudar aqui — as cascas não conhecem a coreografia.
import {
	Config, OutboxDispatcher, InternalMediator, ExternalMediator, closeDatabase, openapi,
	Controller, HttpRouter, Middleware, Router, MainRouter, DrizzleDatabaseDriver, traceClass,
	setBoundedContextEnvironment, type BoundedContextEnvironment,
} from '@codm/core-typescript'
import { container } from 'tsyringe-neo'

export interface RunningServer {
	url: string
	container: typeof container
	stop(): Promise<void>
}

export function assembleMainRouter(routers: Router[]): MainRouter {
	// biome-ignore lint/suspicious/noExplicitAny: tsyringe-neo can't type an abstract class as an injection token.
	const httpRouter = container.resolve(HttpRouter as any) as HttpRouter
	return new MainRouter({ httpRouter, version: Config.version, routers })
}

export async function start(options: { env: BoundedContextEnvironment; port?: number }): Promise<RunningServer> {
	setBoundedContextEnvironment(options.env)
	traceClass([Controller, HttpRouter, Middleware, Router, MainRouter])

	// MIGRAR ANTES DE IMPORTAR — a ordem é sagrada (nota 4 do velho integration-server): os módulos
	// de contexto criam no import (side-effect) e registerJobs enfileira ANTES do setup() migrar.
	// O driver vem do REGISTRY DO AMBIENTE selecionado — real→FileLibsqlDriver, integration→temp.
	// (Ajuste de fiação: o registerAll do env precisa ter rodado antes deste resolve — replicar
	// exatamente o que o velho harness fazia: registrar o kernel do env, resolver, migrar.)
	if (Config.env.EMIT_OPENAPI !== 'true') {
		// biome-ignore lint/suspicious/noExplicitAny: abstract token.
		await (container.resolve(DrizzleDatabaseDriver as any) as DrizzleDatabaseDriver).runMigrations()
	}

	const { ALL_ROUTERS } = await import('./routers')
	const { isCloudProfile, filterRoutersForCloudProfile } = await import('@shared/cloud-profile')
	const routers = filterRoutersForCloudProfile(ALL_ROUTERS, Config.env.CODM_PROFILE || undefined)

	await openapi.generateSpecification(routers)
	if (Config.env.EMIT_OPENAPI === 'true' && process.env.START_SERVER !== 'true') {
		console.log('✅ openapi.json written — exiting (emit-only mode)')
		process.exit(0)
	}

	const mainRouter = assembleMainRouter(routers)
	await mainRouter.start(options.port) // ajuste de fiação: se .start() não aceitar porta, o override é via Config/API_PORT — replicar o mecanismo do velho harness (process.env.API_PORT ??= '0' ANTES do primeiro import de core)

	if (!isCloudProfile()) {
		const { MailboxDispatcher } = await import('@agent/services/MailboxDispatcher')
		// biome-ignore lint/suspicious/noExplicitAny: abstract token.
		;(container.resolve(MailboxDispatcher as any) as MailboxDispatcher).bind(container).start()
	}

	let stopped = false
	async function stop(): Promise<void> {
		if (stopped) return
		stopped = true
		const step = async (label: string, fn: () => Promise<void> | void) => {
			try { await fn() } catch (error) { console.warn(`⚠️ shutdown step failed (${label}):`, error) }
		}
		await step('http server', () => mainRouter.stop())
		if (!isCloudProfile()) {
			const { AgentRunnerFactory } = await import('@agent/services/AgentRunnerFactory/AgentRunnerFactory')
			const { MailboxDispatcher } = await import('@agent/services/MailboxDispatcher')
			// biome-ignore lint/suspicious/noExplicitAny: abstract tokens.
			await step('agent runs', () => (container.resolve(AgentRunnerFactory as any) as AgentRunnerFactory).shutdown())
			// biome-ignore lint/suspicious/noExplicitAny: abstract tokens.
			await step('mailbox dispatcher', () => (container.resolve(MailboxDispatcher as any) as MailboxDispatcher).stop())
		}
		// biome-ignore lint/suspicious/noExplicitAny: abstract tokens.
		await step('outbox dispatcher', () => (container.resolve(OutboxDispatcher as any) as OutboxDispatcher).stop())
		await step('mediator listeners', () => {
			// biome-ignore lint/suspicious/noExplicitAny: abstract tokens.
			;(container.resolve(InternalMediator as any) as InternalMediator).removeAllListeners()
			// biome-ignore lint/suspicious/noExplicitAny: abstract tokens.
			;(container.resolve(ExternalMediator as any) as ExternalMediator).removeAllListeners()
		})
		// biome-ignore lint/suspicious/noExplicitAny: abstract tokens.
		await step('external mediator transport', () => (container.resolve(ExternalMediator as any) as ExternalMediator).stop())
		await step('database connections', () => closeDatabase())
	}

	const port = /* porta efetiva do listener — extrair do mainRouter/httpRouter (fiação) */ Config.env.API_PORT
	return { url: `http://localhost:${port}`, container, stop }
}
```

**Nota de fiação obrigatória:** o bloco acima assume que `registerAll` do ambiente roda antes do resolve do driver. HOJE quem chama `registerAll` é `@shared/index.ts` no import (side-effect) — DEPOIS da migração na ordem antiga. O velho harness resolvia isso registrando o kernel do env explicitamente antes (nota 4). `start()` DEVE replicar essa pré-migração exatamente como o harness fazia — ler `integration-server.ts` (git history se já deletado) e trazer o bloco `registerAll → runMigrations` para dentro de `start()`, generalizado por `options.env`. Se `start()` não migrar antes do import dos routers, o sintoma medido é `SQLITE_ERROR: no such table shared_scheduled_commands`.

### Step T4.2 — index.ts casca (descrição — o arquivo encolhe para ~40 linhas)

`index.ts` mantém: `import 'reflect-metadata'`, `import './boot'`, `startParentWatchdog` import, `startTelemetry`. Corpo:

```typescript
async function main(): Promise<void> {
	const server = await start({ env: Config.env.CODM_ENV, port: Config.env.API_PORT })
	await startTelemetry()
	console.log(`✅ api-ts listening on ${server.url}`)
	let isShuttingDown = false
	const shutdown = async (signal: string) => {
		if (isShuttingDown) return
		isShuttingDown = true
		console.log(`\n🛑 Received ${signal} — shutting down gracefully…`)
		await server.stop()
		process.exit(0)
	}
	process.on('SIGTERM', () => shutdown('SIGTERM'))
	process.on('SIGINT', () => shutdown('SIGINT'))
	process.on('SIGUSR2', () => shutdown('SIGUSR2'))
	startParentWatchdog()
}
main().catch(error => { console.error('❌ Failed to start api-ts:', error); process.exit(1) })
```

(O exit-código-1-quando-step-falha do shutdown antigo: preservar — `stop()` pode devolver um booleano `failed` ou lançar agregado; escolher o mais simples e manter o comportamento de exit code.)

### Step T4.3 — boot.ts: deletar a guarda CODM_E2E (o seletor já recusa não-real sob production — citar o falseador de T1 no lugar do bloco)

### Step T4.4 — Gates + commit

Suíte + tsc + boot smoke (comando no Gate). Expected: drain limpo com exit 0 no SIGINT.

```bash
git add packages/api/typescript/src/server.ts packages/api/typescript/src/index.ts packages/api/typescript/src/boot.ts packages/api/typescript/src/shared/registry.ts
git commit -m "refactor(api): o boot é start({env,port}); index.ts vira casca de processo (T4)"
```

---

## Task T5: CODM_E2E morre; process.env morre fora do Config

**Files to write:**
- Modify: `packages/api/typescript/src/shared/index.ts` — `testControllers` via `byEnvironment({ default: {}, e2e: { TestIngressController } })`
- Modify: `packages/api/typescript/src/agent/registry.ts` — `const E2E = ...` morre; colunas: `{ token: AgentRunnerFactory, real: DefaultAgentRunnerFactory, e2e: E2eAgentRunnerFactory }` e `{ token: ProviderDetector, real: SystemProviderDetector, e2e: MockProviderDetector }` (nomes exatos do arquivo — verificar os tokens reais no expandBindings local)
- Modify: `packages/api/typescript/src/agent/index.ts` — `mountedControllers` via `byEnvironment`
- Sweep: os 17 sites `process.env.` em `packages/api/typescript/src/` → `Config.env` (localizar: `grep -rn "process\.env\." src/ | grep -v test`); chaves que faltarem no `RawEnvSchema` entram com default seguro; **exceção declarada**: `process.env.API_PORT ??=` / `START_SERVER` em caminhos pré-Config (documentar inline por que cada exceção sobrevive, se sobreviver)
- Create: `packages/api/typescript/tests/architecture/process-env.test.ts` — o rail
- Test: e2e continua fora deste task (T6); a suíte api é o gate

**Files to read:**
- `packages/api/typescript/src/agent/registry.ts` (o bloco E2E completo)
- `packages/api/typescript/tests/architecture/` — qualquer rail existente como exemplar de forma (scanner + INVENTORY se precisar de exceções)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** T1, T4
**Consumes (frozen):** `byEnvironment` (T1), `Config.env.CODM_ENV` (T1), o boot por `start()` (T4). Mapeamento 1:1: cada um dos 6 sites CODM_E2E tem destino declarado — divergência de comportamento do e2e é DEFEITO.
**Scope fence:** OUT — playwright.config (T6); /testing (T7). O rail usa o padrão INVENTORY shrink-only SE alguma exceção legítima existir (ex.: `process.env.API_PORT ??=` pré-Config) — senão, lista vazia.
**Gate:** `cd packages/api/typescript && bun test && bun x tsc -p tsconfig.build.json --noEmit`; `grep -rn "CODM_E2E" src/ | wc -l` → 0; rail verde e FALSEADO (adicionar um `process.env.X` num fixture → vermelho).

### Step T5.1 — O rail (proposed file)

```typescript
// packages/api/typescript/tests/architecture/process-env.test.ts — COMPLETE final file
import { describe, expect, it } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * RAIL (spec D14/AC-4): `process.env.` fora do módulo Config é proibido em src/. O Config tipado
 * (`RawEnvSchema`) é a única porta de entrada de ambiente — um site cru é um eixo paralelo em
 * gestação (foi assim que CODM_E2E nasceu). Exceções vivem no INVENTORY (shrink-only, motivo
 * inline); a lista vazia é o estado final.
 */
const SRC = join(import.meta.dir, '../../src')
const INVENTORY: string[] = [
	// 'index.ts', // exemplo: process.env.API_PORT ??= pré-Config — SÓ se a T5 provar inevitável
]

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap(name => {
		const full = join(dir, name)
		return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') && !full.endsWith('.test.ts') ? [full] : []
	})
}

describe('process.env é exclusivo do Config', () => {
	it('nenhum site cru fora do inventário', () => {
		const offenders = walk(SRC)
			.filter(file => !INVENTORY.some(entry => file.endsWith(entry)))
			.filter(file => /process\.env\./.test(readFileSync(file, 'utf8')))
		expect(offenders).toEqual([])
	})
	it('o inventário não tem entradas mortas', () => {
		for (const entry of INVENTORY) {
			const file = walk(SRC).find(f => f.endsWith(entry))
			expect(file, `entrada morta no INVENTORY: ${entry}`).toBeDefined()
			expect(/process\.env\./.test(readFileSync(file!, 'utf8')), `${entry} não usa mais process.env`).toBe(true)
		}
	})
})
```

### Step T5.2 — Os 6 destinos do CODM_E2E (executar um a um, registrar no relato)

| Site | Destino |
|---|---|
| `boot.ts` guarda | JÁ MORTO (T4) |
| `shared/index.ts:36` testControllers | `byEnvironment({ default: {}, e2e: { TestIngressController: controllers.TestIngressController } })` |
| `agent/registry.ts` runner factory | coluna `e2e: E2eAgentRunnerFactory` |
| `agent/registry.ts` provider detector | coluna `e2e: MockProviderDetector` |
| `agent/index.ts` mountedControllers | `byEnvironment({ default: runtimeControllers, e2e: { ...runtimeControllers, TestRunIssueTurnController } })` |
| `FileCloudSession.ts` (leitura crua confessada) | `Config.env` |

### Step T5.3 — Sweep dos process.env restantes + gates + commit

```bash
git add packages/api/typescript/src/ packages/api/typescript/tests/architecture/process-env.test.ts
git commit -m "refactor(api): CODM_E2E vira coluna e2e; process.env é exclusivo do Config + rail (T5)"
```

---

## Task T6: O e2e sobe pelo eixo

**Files to write:**
- Modify: `packages/e2e/playwright.config.ts` — no `env` do webServer do api: `CODM_E2E: ...` sai, `CODM_ENV: 'e2e'` entra (e QUALQUER outra referência a CODM_E2E no runner/scripts do e2e — `grep -rn CODM_E2E packages/e2e scripts/`)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** /e2e
**Depends on:** T5
**Consumes (frozen):** `Config.env.CODM_ENV` + a coluna e2e completa (T5). NENHUMA asserção do e2e muda — se um spec e2e quebrar, o mapeamento 1:1 falhou: consertar a coluna, nunca o teste.
**Scope fence:** OUT — tudo o mais. Este task é 1 arquivo + 1 rodada.
**Gate:** `cd packages/e2e && bun run test` → verde idêntico ao baseline (10 passed, 2 skipped); `grep -rn "CODM_E2E" . --exclude-dir=node_modules` na raiz → 0 fora de `.specs`/`.plans`/git history.

### Step T6.1 — Editar, rodar, commitar

```bash
git add packages/e2e/playwright.config.ts
git commit -m "chore(e2e): sobe com CODM_ENV=e2e — a flag morreu (T6)"
```

---

## Task T7: O /testing herda o boot e exporta o catálogo completo, tipado por derivação

**Files to write:**
- Delete: `packages/api/typescript/tests/support/integration-server.ts`
- Delete: `packages/api/typescript/tests/support/integration-contract.ts`
- Create: `packages/api/typescript/tests/support/testing.ts` — a casca de teste
- Modify: `packages/api/typescript/package.json` — `"./testing": { "types": "./testing.d.ts", "default": "./tests/support/testing.ts" }`; `"./testing-contract"` sai
- Create: `scripts/testing-dts.ts` — gera o `.d.ts` achatado (SPIKE: `dts-bundle-generator` como dev dep; fallback na spec D9)
- Create: `packages/api/typescript/testing.d.ts` — o declaration achatado COMMITADO
- Create: `packages/api/typescript/tests/architecture/testing-dts.test.ts` — gate de frescor (regenera em temp, compara byte-a-byte — padrão `db:check-go`)
- Modify: `package.json` raiz — scripts `testing:dts` e `testing:check-dts`

**Files to read:**
- `packages/api/typescript/tests/support/given/index.ts` (o catálogo: 15 soltos + `GIVEN_MENTION_TAG` + a facade deprecated que NÃO sai na superfície)
- `packages/contracts/package.json` scripts `db:sync-go`/`db:check-go` (o precedente do gate)
- o velho `integration-server.ts` via `git show HEAD~1` (asTestBed/reset — a lógica de adaptação preservada)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test, /sdk
**Depends on:** T4
**Consumes (frozen):** `start({env, port})` + `RunningServer` (T4); os 15 nomes exatos do catálogo: `givenUser`, `givenAccount`, `givenUserWithAccount`, `givenActiveSession`, `givenOwner`, `givenOwnerWithResponsible`, `givenWorkspace`, `givenThread`, `givenChannel`, `givenRemote`, `givenRemoteMembership`, `givenIssue`, `givenStop`, `givenDomainEvent`, `givenUserProfile` + `GIVEN_MENTION_TAG`. `createGivenHelpers` NÃO entra (deprecated, TST-18).
**Scope fence:** OUT — lado react (T8 consome; até lá o react pode quebrar tsc — T7+T8 são a MESMA onda de merge, commitar T7 não exige react verde, o gate é backend-only). O spike do dts decide ferramenta e REGISTRA o veredito no relato; se engasgar → fallback assignability-gate (spec D9) SEM bloquear.
**Gate:** `cd packages/api/typescript && bun test && bun x tsc -p tsconfig.build.json --noEmit`; `bun testing:check-dts` verde e FALSEADO (mudar assinatura de um given → gate vermelho → reverter); o spike de boot do harness re-medido (`useIntegrationBackend` via nova casca) com tempo registrado no relato.

### Step T7.1 — Proposed file (testing.ts)

```typescript
// packages/api/typescript/tests/support/testing.ts — COMPLETE final file
import 'reflect-metadata'
import { container } from 'tsyringe-neo'
import { start, type RunningServer } from '../../src/server'

/**
 * A CASCA DE TESTE sobre o boot de produção (spec D5): `start({env:'integration', port:0})` é a
 * MESMA função que `index.ts` chama — zero coreografia própria. Só o que é de teste vive aqui:
 * cache por processo, reset, o adaptador TestBedLike para os givens.
 * Tipos públicos: derivados no `testing.d.ts` COMMITADO (gate `testing:check-dts`) — nunca
 * redeclarados à mão em consumidor nenhum.
 */
export interface TestBedLike {
	resolve<T>(token: unknown): T
	readonly ownerId: string
}

export interface IntegrationBackend {
	url: string
	container: RunningServer['container']
	asTestBed(): TestBedLike
	reset(): Promise<void>
	stop(): Promise<void>
}

let booted: IntegrationBackend | null = null
let booting: Promise<IntegrationBackend> | null = null

export async function startIntegrationBackend(options?: { ownerId?: string }): Promise<IntegrationBackend> {
	if (booted) return booted
	if (booting) return booting
	booting = (async () => {
		const server = await start({ env: 'integration', port: 0 })
		const ownerId = options?.ownerId ?? 'integration-tenant'
		const asTestBed = (): TestBedLike => ({
			ownerId,
			resolve: <T>(token: unknown): T => container.resolve(token as never) as T,
		})
		const reset = async (): Promise<void> => {
			// PRESERVAR do velho integration-server (git show): o reset truncava via driver do
			// container — trazer a implementação idêntica, é a única lógica não-boot que ele tinha.
		}
		booted = { url: server.url, container: server.container, asTestBed, reset, stop: server.stop }
		return booted
	})()
	return booting
}

// O CATÁLOGO COMPLETO (spec D8) — os soltos, nunca a facade deprecated:
export {
	givenUser, givenAccount, givenUserWithAccount, givenActiveSession,
	givenOwner, givenOwnerWithResponsible, givenWorkspace,
	givenThread, GIVEN_MENTION_TAG, givenChannel,
	givenRemote, givenRemoteMembership, givenIssue, givenStop,
	givenDomainEvent, givenUserProfile,
} from './given'
```

### Step T7.2 — Spike do d.ts + gate

`bun add -d dts-bundle-generator` (raiz). `scripts/testing-dts.ts` invoca-o sobre `tests/support/testing.ts` → `packages/api/typescript/testing.d.ts` achatado (zero imports relativos a src). Gate `testing-dts.test.ts`: regenera em `$TMPDIR`, `expect(generated).toBe(committed)`. Vereditos possíveis do spike: (a) achatou limpo → seguir; (b) engasgou em decorators/entidades → fallback D9 (contrato estrutural + `satisfies` no backend), registrar por quê.

### Step T7.3 — Gates + commit

```bash
git add packages/api/typescript/tests/support/ packages/api/typescript/package.json packages/api/typescript/testing.d.ts packages/api/typescript/tests/architecture/testing-dts.test.ts scripts/testing-dts.ts package.json bun.lock
git commit -m "feat(testing): /testing herda start() e exporta o catálogo completo tipado por derivação (T7)"
```

---

## Task T8: O console consome a herança; a fronteira do Go fala

**Files to write:**
- Modify: `packages/app/react/tests/support/integration-harness.ts` — `IntegrationTestingModule` morre; tipos via `import type { IntegrationBackend } from '@codm/api-typescript/testing'` (o `types` do subpath resolve no `.d.ts` achatado — o truque do especificador computado PODE morrer se o tsc do react ficar limpo e rápido; MEDIR: se o import literal degradar o tsc, manter o computado só no runtime e registrar); URL do Go no `configureClient` → stub local que responde 501 com mensagem nomeando a fronteira
- Modify: call sites react de `createGivenHelpers`/`loadBackendGivens` → givens soltos do catálogo (grep `loadBackendGivens\|createGivenHelpers` em `packages/app/react/src`)
- Test: `packages/app/react/tests/architecture/go-boundary.test.ts` — AC-6

**Files to read:**
- `packages/app/react/tests/support/integration-harness.ts` atual
- um teste migrado que semeia (ex.: `ThreadSettingsDialog/index.test.tsx`) — o call-site shape

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /storybook, /test
**Depends on:** T7
**Consumes (frozen):** `startIntegrationBackend`, `IntegrationBackend`, `TestBedLike`, os 16 exports do catálogo — TODOS de `@codm/api-typescript/testing` (T7); `configureClient` de `@codm/client-typescript/http`.
**Scope fence:** OUT — qualquer mudança de asserção nos testes migrados (só o MECANISMO de seed/tipos muda); tooling do backend (T7, committed).
**Gate:** `cd packages/app/react && bun test` verde; `bun x tsc --noEmit` 0 com o TEMPO registrado antes×depois (baseline ~6.3–7.1s — se o import de tipos degradar >20%, voltar ao computado e registrar); `go-boundary.test.ts` verde e falseado.

### Step T8.1 — O stub da fronteira (dentro do harness, proposed shape)

```typescript
const goBoundaryStub = Bun.serve({
	port: 0,
	fetch: () =>
		new Response(
			JSON.stringify({ error: 'GO_GATEWAY_NOT_IN_HARNESS', message: 'O gateway Go não participa do harness de integração do console — comportamento gateway-owned é visual-only (story) ou e2e. Ver .specs/2026-08-10-eixo-unico-ambiente-design.md D10.' }),
			{ status: 501, headers: { 'content-type': 'application/json' } },
		),
})
configureClient({ typescript: backend.url, go: `http://localhost:${goBoundaryStub.port}` })
```

`go-boundary.test.ts`: chama um endpoint Go via SDK dentro do harness → asserta status 501 + `GO_GATEWAY_NOT_IN_HARNESS` no corpo (falseador: apontar o go de volta pro backend.url → o teste tem que ficar vermelho).

### Step T8.2 — Gates + commit

```bash
git add packages/app/react/tests/ packages/app/react/src/
git commit -m "refactor(console): harness herda tipos derivados; fronteira do Go falha alto (T8)"
```

---

## Task T9: Os tokens de projeção morrem; consumidores injetam o driver

**Files to write:**
- Sweep: 41 consumidores de `DrizzleClient` + 2 de `UnitOfWorkFactory` (localizar: `grep -rln "DrizzleClient\b\|UnitOfWorkFactory\b" src/ | grep -v test`) — cada um passa a injetar `DrizzleDatabaseDriver` e ler `.db` / `.unitOfWorkFactory`
- Modify: `packages/api/typescript/src/shared/registry.ts` — os bindings `DrizzleClient`/`UnitOfWorkFactory` e os dois `useFactory` morrem; `resolveDriver` helper morre
- Modify: onde os tokens são DECLARADOS (core ou shared — localizar e deletar as classes/símbolos token)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /repository
**Depends on:** T3
**Consumes (frozen):** o binding do driver como classe (T3). Padrão do sweep, uniforme: `@inject(DrizzleDatabaseDriver)` (ou resolve posicional — copiar o shape de um repositório que JÁ injeta o driver, se existir; senão o construtor `constructor(private readonly driver: DrizzleDatabaseDriver)` + leitura `this.driver.db` no ponto de uso).
**Scope fence:** OUT — mudanças de comportamento em repositório (o sweep é MECÂNICO: mesmo objeto `.db`, só o caminho de injeção muda); HealthService intocado.
**Gate:** `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` 0 (o tsc é o guia do sweep) e `bun test` inteiro verde; `grep -rn "useFactory" src/shared/registry.ts` → só HealthService (AC-3 completo).

### Step T9.1 — Sweep guiado por tsc + gates + commit

Deletar os tokens primeiro → `tsc` lista os 43 → corrigir um a um no padrão uniforme → suíte.

```bash
git add packages/api/typescript/src/ packages/api/typescript/core/src/
git commit -m "refactor(api): DrizzleClient/UnitOfWorkFactory morrem; consumidores injetam o driver (T9)"
```

---

## Final Validation

- [ ] `bun tsc` — 0 erros em todos os workspaces
- [ ] `bun lint` — limpo
- [ ] `cd packages/api/typescript && bun test` — verde (1366+)
- [ ] `cd packages/app/react && bun test` — verde (257+); tsc do react com tempo registrado antes×depois (AC do import de tipos)
- [ ] `bun run test:tooling` — verde
- [ ] `cd packages/e2e && bun run test` — verde SEM mudança de asserção (baseline 10 passed / 2 skipped)
- [ ] Boot do harness re-medido (antes ~750–1080ms) — delta do MailboxDispatcher/openapi herdados registrado; >2s → reportar ao founder com números (spec Risks)
- [ ] Smoke manual do shell Tauri (o boot de produção é o daemon do desktop — subir o shell e ver o console conectar)
- [ ] AC mapping:
  - AC-1 → integration-server.ts DELETADO; `tests/support/testing.ts` chama `start()` (T7); index.ts casca (T4)
  - AC-2 → `grep -rn CODM_E2E` = 0 (T5/T6); e2e verde com `CODM_ENV=e2e` (T6)
  - AC-3 → `grep useFactory src/shared/registry.ts` → só HealthService (T3+T9); colunas HttpRouter (T3)
  - AC-4 → `tests/architecture/process-env.test.ts` falseado (T5)
  - AC-5 → exports de `testing.ts` (T7); `testing-dts.test.ts` falseado (T7); react sem `IntegrationTestingModule` (T8)
  - AC-6 → `tests/architecture/go-boundary.test.ts` falseado (T8)
  - AC-7 → teste do DataDirLock ajustado, código `DATA_DIR_LOCKED` (T2)
  - AC-8 → tsc 0 pós-sweep (T9)
  - AC-9 → esta seção inteira

## Notes

- **Dev dep nova:** `dts-bundle-generator` (T7, raiz). Se o spike reprovar, remover a dep e seguir o fallback D9.
- **Ordem sagrada do boot** (nota 4 do velho integration-server): selecionar env → registrar kernel do env → migrar → importar routers. Regressão = `SQLITE_ERROR: no such table`.
- **T7+T8 são a mesma onda de merge**: T7 pode deixar o tsc do react vermelho transitoriamente (o subpath muda); T8 fecha. Não abrir PR entre os dois.
- **Nada de `bun cli`** — artefatos são composition root, test-support e rails (PR-27 exempt; nenhum citizen scaffoldável).
