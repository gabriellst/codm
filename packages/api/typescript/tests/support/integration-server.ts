import 'reflect-metadata'
import { container } from 'tsyringe-neo'
import type { IntegrationBackend, TestBedLike } from './integration-contract'

/**
 * O BACKEND DE VERDADE DENTRO DO PROCESSO DE TESTE DO CONSOLE (spec Decision 5).
 *
 * Mock, mesmo tipado, devolve o que foi semeado e obriga o teste a asseverar por procuração;
 * aqui a requisição da SDK atravessa controller, middleware e use case REAIS sobre banco em
 * processo — a asserção vira o comportamento.
 *
 * HERDA em vez de RE-DECLARAR (correção do founder): a montagem do `MainRouter` vive em
 * `../../src/server.ts` (`assembleMainRouter`) — a MESMA função que `src/index.ts` usa para subir
 * em produção. Este harness não re-instancia `new MainRouter({...})` por conta própria; ele resolve
 * o transporte deste ambiente e chama a montagem de produção.
 *
 * AJUSTES DE FIAÇÃO vs a forma proposta no plano (verificados contra o barril/registry reais —
 * ver o relato da T3; o CONTRATO público — `startIntegrationBackend`/`asTestBed`/`reset`/`stop`/
 * `url`/`container`, agora em `./integration-contract` — não mudou):
 *
 * 1. `rootContainer` NÃO é exportado por `@codm/core-typescript`. `BoundedContext.ts` importa
 *    `container as rootContainer` de `tsyringe-neo` mas nunca reexporta o nome — importamos
 *    `container` diretamente de `tsyringe-neo` (já é dependência direta deste workspace; é o
 *    mesmo caminho que `src/index.ts`/`src/server.ts` usam).
 *
 * 2. `Config` é avaliado de forma EAGER na carga do módulo `@codm/core-typescript`
 *    (`export const Config = { env: EnvSchema.parse(process.env) } as const`). Hoisting de import
 *    ES module garante que QUALQUER import estático anterior de `@codm/core-typescript` no grafo do
 *    processo já congela `Config.env.API_PORT` antes do corpo de `boot()` rodar. Este arquivo só
 *    toca `@codm/core-typescript` via `import()` DINÂMICO dentro de `boot()` — nunca no topo — e o
 *    consumidor (o harness do lado react) alcança ESTE módulo também por `import()` dinâmico com
 *    especificador computado, então nada no grafo do processo força a avaliação mais cedo. Ainda
 *    assim, `process.env.API_PORT ??=` roda como PRIMEIRA linha de `boot()`, e o preload do lado
 *    react (`tests/setup.ts`) também seta a porta antes de qualquer coisa — defesa em duas camadas.
 *
 * 3. `HttpRouter` só é vinculado a `FastifyHttpRouter` sob o ambiente `real`
 *    (`{ token: HttpRouter, mock: null, integration: null, real: FastifyHttpRouter }` em
 *    `src/shared/registry.ts`) — sob `integration` o token fica DELIBERADAMENTE sem binding
 *    (suites de integration nunca sobem HTTP; o TestBed nunca resolve esse token). Este harness
 *    precisa de um transporte de verdade, então registra `FastifyHttpRouter` para o token
 *    `HttpRouter` ele mesmo, uma vez, ANTES de chamar `assembleMainRouter` (que resolve o token e
 *    espera encontrá-lo já vinculado — exatamente como em produção, onde `real` já o vincula).
 *
 * 4. `BoundedContext.create` roda `registerJobs` ANTES de `options.setup` — e `@shared/index.ts`
 *    passa `jobs: [{ handler: PruneOutbox, … }]` (registerJobs) E migra dentro do PRÓPRIO `setup()`
 *    (que roda depois, na MESMA chamada). Deixado como o plano original propunha (sem migrar antes),
 *    `registerJobs` tenta ENFILEIRAR `PruneOutbox` numa tabela (`shared_scheduled_commands`) que
 *    ainda não existe — measured: `SQLITE_ERROR: no such table`. `src/index.ts` evita isso migrando
 *    o driver `real` ANTES de importar `./routers` (`migrateEmbeddedDatabase()`); esse helper mira o
 *    driver ERRADO para nós (o `real`, arquivo compartilhado — não o `integration`, temp file em
 *    processo). Este arquivo replica a MESMA ordem (`registerAll` → `runMigrations()`) mas contra o
 *    registry/driver de `integration`, ANTES de importar `ALL_ROUTERS` — ver o bloco logo abaixo. A
 *    migração que `@shared/index.ts` roda depois, dentro do próprio `setup()`, vira um no-op
 *    idempotente sobre o mesmo ledger `_sqlite_migrations`. `TestBed.createIntegrationMode` nunca
 *    pisa nessa corrida porque não chama `BoundedContext.create` nenhuma vez (ver nota 6 abaixo).
 *
 * 5. `OutboxDispatcher` (`DrizzleOutboxDispatcher` sob `integration`, espelhando `real`) é iniciado
 *    pelo mesmo hook `setup()` e se re-agenda via `setTimeout` SEM `unref()` — `stop()` precisa
 *    chamar `outboxDispatcher.stop()` explicitamente, senão o processo do `bun test` nunca sai
 *    sozinho. O poller do `CommandQueue` (`SqliteCommandQueue`, iniciado pelos jobs `PruneOutbox`/
 *    `FireDueLoops`/`AutoArchiveCompletedIssues` que vários contextos registram) já dá `unref()` no
 *    próprio timer — não precisa de stop explícito para o processo sair; ele fica rodando em
 *    background e dormente (repeats de 24h/1h/1min, nunca disparam dentro da vida de um teste).
 *
 * 6. NUNCA `TestBed.create` aqui: ele registra num CHILD container — nasceriam dois bancos, e o
 *    seed iria para o que o servidor não lê. O adaptador `asTestBed()` expõe o container DO
 *    SERVIDOR (o `container` do tsyringe-neo) com a superfície (duck-typed) que
 *    `createGivenHelpers`/os `givenX` soltos consomem.
 *
 * PORTÁVEL (spec Decision 15): a lógica DESTE harness não conhece nenhum given nomeado — quem
 * decide QUAL given chamar é sempre o teste consumidor. `createGivenHelpers`/`givenThread` são
 * reexportados abaixo por conveniência de import (o consumidor do lado react não tem alias para
 * `tests/support/given` — só alcança este módulo, `@codm/api-typescript/testing`), não porque o
 * harness precise deles para funcionar.
 */

/**
 * tsyringe-neo's `InjectionToken<T>` requires a CONCRETE constructor (`{ new (...args): T }`); an
 * `abstract class` reference structurally cannot satisfy that, so the container methods reject it
 * at the type level even though it works perfectly at runtime. `TestBed.resolve` documents the same
 * gap ("The `as any` … lives here once, so tests never cast") — these two helpers are that same
 * single, isolated escape hatch for this file, so no call site below casts.
 */
function resolveAbstract<T>(token: abstract new (...args: any[]) => T): T {
	// biome-ignore lint/suspicious/noExplicitAny: tsyringe-neo can't type an abstract class as an injection token — see the helper's doc.
	return container.resolve(token as any) as T
}

function registerAbstractSingleton<T>(token: abstract new (...args: any[]) => T, impl: new (...args: any[]) => T): void {
	// biome-ignore lint/suspicious/noExplicitAny: tsyringe-neo can't type an abstract class as an injection token — see the helper's doc.
	container.registerSingleton(token as any, impl)
}

/**
 * The contract's `resolve<T>(token: unknown): T` (structural, no tsyringe types) meets
 * `resolveAbstract`'s `abstract new (...) => T` here — the ONE narrowing point for the untyped
 * `token: unknown` the contract hands us, so `IntegrationBackend.container.resolve` /
 * `TestBedLike.resolve` stay generic without re-casting at each call site below.
 */
function resolveUnknownToken<T>(token: unknown): T {
	return resolveAbstract(token as abstract new (...args: any[]) => T)
}

export type { IntegrationBackend, TestBedLike }

let booted: IntegrationBackend | null = null
let booting: Promise<IntegrationBackend> | null = null

export async function startIntegrationBackend(options?: { ownerId?: string }): Promise<IntegrationBackend> {
	if (booted) return booted
	if (!booting) booting = boot(options)
	booted = await booting
	booting = null
	return booted
}

async function boot(options?: { ownerId?: string }): Promise<IntegrationBackend> {
	// (2) Primeira linha — ver a nota de fiação 2 acima.
	process.env.API_PORT ??= String(30000 + Math.floor(Math.random() * 20000))
	process.env.NODE_ENV ??= 'test'

	// (1) Seleção de ambiente ANTES do import dos contextos — os boots são side-effect de módulo.
	const { setBoundedContextEnvironment, registerAll, DrizzleDatabaseDriver } = await import('@codm/core-typescript')
	setBoundedContextEnvironment('integration')

	// (4) MIGRA ANTES de importar ALL_ROUTERS — mirrors `src/index.ts`'s `migrateEmbeddedDatabase()`-
	// before-routers ordering, mas mirando o driver de `integration` (temp file em processo), não o
	// `real` (arquivo compartilhado) que `migrateEmbeddedDatabase()` migraria. A RAZÃO é a mesma:
	// `BoundedContext.create` roda `registerJobs` (que ENFILEIRA `PruneOutbox` num
	// `shared_scheduled_commands` que ainda não existe) ANTES de `options.setup` (onde
	// `@shared/index.ts` migra) — DENTRO da MESMA chamada. Migrar aqui, com o registry aplicado à
	// mão, fecha essa corrida; a migração que `@shared/index.ts` roda depois é um no-op idempotente
	// sobre o mesmo ledger `_sqlite_migrations`. `TestBed.createIntegrationMode` evita a corrida por
	// um caminho diferente (nunca chama `BoundedContext.create` — só `registerAll` + migração manual
	// num child container); aqui replicamos a MESMA ordem (registrar → migrar) mas no container ROOT.
	const { ALL_REGISTRIES } = await import('../../src/shared/registry')
	registerAll(container, ALL_REGISTRIES.integration)
	const driver = resolveAbstract(DrizzleDatabaseDriver)
	await driver.runMigrations()

	// Import DINÂMICO — agora os contextos bootam em integration sobre um banco JÁ migrado: outbox
	// Drizzle sobre o mesmo banco, mediator em memória.
	const { ALL_ROUTERS } = await import('../../src/routers')
	const { assembleMainRouter } = await import('../../src/server')

	const { Config, HttpRouter, FastifyHttpRouter, OutboxDispatcher } = await import('@codm/core-typescript')
	const { OPERATOR_ID } = await import('@auth/operator')

	// (3) `integration` deixa HttpRouter sem binding — este harness precisa de transporte de verdade,
	// registrado ANTES de assembleMainRouter (que resolve o token e espera achá-lo vinculado).
	registerAbstractSingleton(HttpRouter, FastifyHttpRouter)

	const mainRouter = assembleMainRouter(ALL_ROUTERS)
	await mainRouter.start()

	// (5) precisa de stop() explícito — o timer não é unref'd.
	const outboxDispatcher = resolveAbstract(OutboxDispatcher)

	return {
		url: `http://127.0.0.1:${Config.env.API_PORT}`,
		container: { resolve: <T>(token: unknown): T => resolveUnknownToken<T>(token) },
		asTestBed: () => ({
			resolve: <T>(token: unknown): T => resolveUnknownToken<T>(token),
			ownerId: options?.ownerId ?? OPERATOR_ID,
		}),
		reset: () => driver.reset(),
		stop: async () => {
			await mainRouter.stop()
			await outboxDispatcher.stop()
			booted = null
		},
	}
}

// Reexportado por conveniência (ver o doc acima) — o consumidor do lado react não tem alias para
// `tests/support/given`, então alcança tudo por este único subpath (`@codm/api-typescript/testing`).
export { createGivenHelpers, givenThread } from './given'
