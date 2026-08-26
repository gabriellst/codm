// server.ts — the ENTIRE boot choreography (spec Decisions 1/2 — .specs/2026-08-10-eixo-unico-
// ambiente-design.md), lived here as ONE function so production (src/index.ts), the console's
// integration test harness (tests/support/testing.ts, T7), and e2e (`CODM_ENV=e2e`) all INHERIT
// the same sequence instead of re-enacting it. Before T4 this file only held `assembleMainRouter`
// (extracted so the harness wouldn't re-declare `new MainRouter({...})`); T4 pulls the rest of what
// used to be `src/index.ts`'s `start()` down here, generalized by `options.env`, so index.ts is
// reduced to a process shell (signals, watchdog, telemetry) and the harness stops re-implementing
// the migration-ordering dance its own docblock (now deleted) confessed line by line.
import {
	BoundedContext,
	Config,
	openapi,
	Controller,
	HttpRouter,
	Middleware,
	Router,
	MainRouter,
	DatabaseDriver,
	traceClass,
	setBoundedContextEnvironment,
	type BoundedContextEnvironment,
	resolve,
} from '@codm/core-typescript'
import { container } from 'tsyringe-neo'
import { criteriaFromEnv } from '@shared/deployment'
// T1.5 APAGOU CINCO IMPORTS DAQUI: `OutboxDispatcher`, `InternalMediator`, `ExternalMediator`,
// `AgentRunnerFactory` e `MailboxDispatcher`. A raiz de composição os importava para PARAR recursos
// que ela não tinha adquirido — e dois deles vinham de dentro de `@agent/`, o que fazia este arquivo
// depender de um contexto específico pelo caminho de import, não só pelo nome no `if`.
//
// Um contexto novo que adquira um recurso agora o devolve no próprio `shutdown`. Este arquivo não
// cresce mais uma linha por recurso do produto, que era a tendência que ele tinha.

export interface RunningServer {
	url: string
	container: typeof container
	stop(): Promise<void>
}

/**
 * Resolve the transport (whatever `HttpRouter` is bound to in the caller's active environment) and
 * assemble the `MainRouter` that mounts `routers` on it. Does NOT call `.start()` — the caller
 * decides when to listen. Kept EXPORTED (not folded fully private into `start()`) — `start()` itself
 * calls it below, and it stays a usable seam for anything that needs the router assembled without
 * also starting the listener.
 */
export function assembleMainRouter(routers: Router[]): MainRouter {
	// Resolvido UMA vez aqui (não inline dentro de `new MainRouter(...)`) — a mesma instância é
	// compartilhada com o MainRouter, que monta as rotas dos contextos e sobe o servidor.
	const httpRouter = resolve(container, HttpRouter)

	return new MainRouter({
		httpRouter,
		routers,
	})
}

/**
 * THE boot function. `options.env` selects the axis column (`real` for production, `integration`
 * for the console harness, `e2e` for Playwright); `options.port` overrides `Config.env.API_PORT`
 * (the harness/e2e pass `0` for an OS-assigned ephemeral port — see `MainRouter.start`).
 */
export async function start(options: { env: BoundedContextEnvironment; port?: number }): Promise<RunningServer> {
	setBoundedContextEnvironment(options.env)
	traceClass([Controller, HttpRouter, Middleware, Router, MainRouter])

	// A ORDEM DO BOOT, em três etapas, e cada uma existe por uma regressão medida:
	//
	//   1. LIGAR    — todos os bindings de todo contexto montado (fase A, ADR 0007)
	//   2. MIGRAR   — resolve o driver pelo topo neutro e concilia o schema
	//   3. MONTAR   — cria os contextos e seus Routers (fase B); nenhum registra binding
	//
	// ── por que LIGAR vem antes de MIGRAR ────────────────────────────────────────────────────────
	// Migrar RESOLVE o driver, e resolver cacheia a instância no container. Enquanto o registro
	// acontecia contexto a contexto durante a montagem, esse cache era descartado logo depois — dois
	// consumidores acabavam com drivers DIFERENTES sobre o mesmo arquivo, cada um com seu portão
	// FIFO, e dois "serializados" disputavam o lock do SQLite. Era daí que vinha o pin do driver, e é
	// por isso que ele pôde ser apagado: com tudo ligado antes, nada re-registra depois.
	//
	// ── por que MIGRAR vem antes de MONTAR ───────────────────────────────────────────────────────
	// Montar um contexto ESCREVE no banco: `registerJobs` enfileira os jobs repetíveis em
	// `shared_scheduled_commands`. Migrar depois da composição dava `no such table` — medido.
	//
	// `setBoundedContextEnvironment` é o portão fail-closed que torna tudo isto seguro de raciocinar:
	// o falseador de T1 (`BoundedContext.environment.test.ts`) prova que o seletor recusa qualquer
	// ambiente não-`real` sob `NODE_ENV=production`.

	// COMPOSIÇÃO EXPLÍCITA. O manifesto é DADO — importá-lo não monta nada — e o laço monta
	// exatamente os contextos que a tabela de alocação seleciona sob estes critérios. Importado
	// DINAMICAMENTE para avaliar depois de `setBoundedContextEnvironment`, porque o `byEnvironment`
	// nos barris de controller de `agent`/`shared` lê a coluna que ele já selecionou.
	const { MANIFEST } = await import('@generated/composition.generated')
	const { bindContexts, composeContexts } = await import('./compose')
	const criteria = criteriaFromEnv()

	// FASE A — TODOS os bindings, de todo contexto montado, numa passada só. Cobre o registry do
	// kernel (o `shared` monta sempre) e os módulos da família escolhida pela tabela de alocação.
	bindContexts(MANIFEST, criteria, options.env)

	// MIGRAÇÃO — pelo TOPO NEUTRO, e DEPOIS de a família estar ligada.
	//
	// A ORDEM: registry base → módulo da família → MIGRAR → compor. Migrar antes do módulo resolvia um
	// token que o registry de base já não liga; migrar depois da composição era tarde, porque montar um
	// contexto com `jobs` escreve em `shared_scheduled_commands` (medido: *no such table*).
	//
	// PELO TOPO NEUTRO (`DatabaseDriver`), porque o que `runMigrations()` FAZ é decisão da família
	// (ADR 0005): a `libsql` APLICA no boot, idempotente sobre o ledger compartilhado; a `pg` NÃO
	// aplica — ela CONFERE e RECUSA, porque migrar é passo de deploy e um migrador por réplica é o
	// defeito simétrico. Mesma chamada, comportamentos diferentes, e o boot não sabe em qual família
	// está. Um `if (family === 'pg')` aqui seria exatamente o desvio de caso especial que o
	// `CLAUDE.md` proíbe.
	//
	// O guarda de emissão de spec continua: `bun sdk` importa a raiz de composição só para colher
	// routers, e abrir infra ali abriria o data dir real.
	if (Config.env.EMIT_OPENAPI !== 'true') {
		await resolve(container, DatabaseDriver).runMigrations()
	}

	const { routers, contexts } = await composeContexts(MANIFEST, criteria)

	// Build OpenAPI spec (used by scripts/emit-openapi.ts when EMIT_OPENAPI=true). Reusa os MESMOS
	// `routers` que a composição produziu — uma emissão sob o deployment de nuvem documenta
	// exatamente o que ela serve, sem passo de filtro no meio.
	await openapi.generateSpecification(routers)

	// If we only need the spec (emit-openapi mode), exit after writing. Boot behavior, not
	// process-shell behavior — stays inside `start()` (spec scope fence).
	if (Config.env.EMIT_OPENAPI === 'true' && Config.env.START_SERVER !== 'true') {
		console.log('✅ openapi.json written — exiting (emit-only mode)')
		process.exit(0)
	}

	// HTTP router — resolved by the abstract `HttpRouter` DI token, not the Fastify concrete class.
	// `options.port` overrides `Config.env.API_PORT` when given (the harness/e2e ask for `0`); the
	// EFFECTIVE bound port comes back from `MainRouter.start` (relevant when the OS assigns one).
	const mainRouter = assembleMainRouter(routers)
	const effectivePort = await mainRouter.start(options.port)

	// A FASE DE START (T1.5) — cada contexto liga o que é dele, na ordem em que foi composto.
	//
	// Aqui morava `if (mounted.includes('agent')) { … MailboxDispatcher … }`. O guard era a raiz de
	// composição sabendo o NOME de um contexto para decidir se mexia nele — a mesma decisão que a
	// composição já tinha tomado, escrita uma segunda vez com um literal. As duas cópias só
	// concordavam enquanto ninguém mexesse em nenhuma.
	//
	// Agora não há o que pular: `startAll` percorre os contextos que EXISTEM, e existir já é a
	// resposta que o `if` procurava. Um contexto novo que precise ligar algo declara `start` no seu
	// descritor e este arquivo não fica sabendo.
	await BoundedContext.startAll(contexts)

	let stopped = false

	// The production `shutdown()` sequence WITHOUT `process.exit` — the caller (src/index.ts) exits;
	// the harness (tests/support/testing.ts, T7) calls this and stays alive for the next test. Mirror
	// of the origin sequence: stop accepting HTTP → drain the outbox → drop mediator
	// subscriptions → stop the external transport → close DB pools LAST, after every writer is quiet.
	// Each step is guarded so a failed resource never aborts the rest of the drain.
	async function stop(): Promise<void> {
		if (stopped) return
		stopped = true

		const failures: string[] = []
		const step = async (label: string, fn: () => Promise<void> | void): Promise<void> => {
			try {
				await fn()
			} catch (error) {
				failures.push(label)
				console.warn(`⚠️ shutdown step failed (${label}):`, error)
			}
		}

		// TRÊS PASSOS (T1.5), e é a lista inteira: parar de aceitar → devolver o que os contextos
		// pegaram → fechar o banco por último, quando todo escritor já está quieto.
		//
		// Os seis passos do meio eram um `shutdownAll` reimplementado à mão, com o agravante de dois
		// deles viverem sob `if (mounted.includes('agent'))`. Cada um foi para o `shutdown` do
		// contexto DONO do recurso (`agent/lifecycle.ts`, `shared/lifecycle.ts`), e a ordem que eles
		// tinham entre si continua garantida — o LIFO do kernel é o inverso da ordem de composição, e
		// `agent` compõe depois de `shared`.
		//
		// O banco fica FORA do laço de propósito, e o kernel escreve isso no contrato do `shutdown`:
		// pool é recurso de PROCESSO, não de contexto. Um contexto fechando o pool derrubaria os
		// outros que ainda estão drenando.
		await step('http server', () => mainRouter.stop())

		for (const failure of await BoundedContext.shutdownAll(contexts)) {
			failures.push(`context ${failure.context}`)
			console.warn(`⚠️ shutdown step failed (context ${failure.context}):`, failure.error)
		}

		await step('database connections', () => resolve(container, DatabaseDriver).close())

		// The exit-code-1-on-failed-step behavior of the old `shutdown()` is preserved at the SHELL
		// level: index.ts wraps its `await server.stop()` in try/catch and exits 1 on rejection, rather
		// than this function calling `process.exit` itself — `stop()` must be safe for the harness to
		// call too, which never wants the test process to exit.
		if (failures.length > 0) {
			throw new Error(`Graceful shutdown completed with failed step(s): ${failures.join(', ')} — see warnings above`)
		}
	}

	return { url: `http://localhost:${effectivePort}`, container, stop }
}
