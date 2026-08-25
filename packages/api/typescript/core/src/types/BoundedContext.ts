import type { ZodType } from 'zod'
import type { DependencyContainer } from 'tsyringe-neo'
import { container as rootContainer } from 'tsyringe-neo'
import { Router } from './Router'
import type { Controller } from './Controller'
import type { Middleware, MiddlewareClass } from './Middleware'
import { InternalMediator, ExternalMediator, Mediator } from '../services/Mediator'
import { CommandQueue } from '../services/CommandQueue'
import { autoTrace } from '../utils/Tracing'
import { registerAll, type InstanceRegistry } from './Registry'
import type { Handler } from './Handler'
import type { Projector } from './Projector'
import { tryCatch } from '../utils/TryCatch'
import { resolve } from '../injection'

type Constructor<T = object> = new (...args: any[]) => T
type MiddlewareInput = Record<string, Constructor<Middleware>> | MiddlewareClass[] | []
type HandlerRecord = Record<string, new (...args: any[]) => Handler>

export interface JobDefinition {
	handler: new (...args: any[]) => Handler
	/**
	 * Opcional desde a DC0: a cadência pode ser declarada no PRÓPRIO job, como `static repeat` na
	 * classe do handler. Quando os dois existem, este vence — a lista continua podendo sobrescrever
	 * um caso sem que o job precise saber disso.
	 */
	repeat?: { every: number } | { pattern: string }
}

/**
 * De onde sai a cadência de um job. É o mesmo movimento de `Projector.events`: a declaração mora
 * no artefato que ela governa, e não numa lista central que envelhece longe dele.
 *
 * Função PURA e exportada de propósito — dá testemunha do dispatch sem precisar montar contexto,
 * resolver container nem tocar em fila.
 */
export function resolveJobCadence(job: JobDefinition): JobDefinition['repeat'] {
	return job.repeat ?? (job.handler as { repeat?: JobDefinition['repeat'] }).repeat
}

export interface BoundedContextOptions<TName extends string = string> {
	// Context name — the OpenAPI tag and log label (mounting is uniform; controllers own their
	// full version-relative paths). Generic so
	// the core stays decoupled from the product's context list: the product supplies a branded
	// `ContextName` (from its `shared/contexts` manifest) and infers the literal here, while the
	// core imports nothing from `src/`. `''` is valid — a `root: true` context has no path prefix.
	name: TName
	root?: boolean
	controllers: Record<string, Constructor<Controller<ZodType, ZodType>>>
	middlewares?: MiddlewareInput
	skipMiddlewares?: MiddlewareInput
	internalHandlers?: HandlerRecord
	externalHandlers?: HandlerRecord
	projectors?: Record<string, new (...args: any[]) => Projector>
	/**
	 * One-shot COMMAND executors — the consumer half of `CommandQueue.enqueueCommand(...)`. Registered
	 * on the queue so THIS process executes them. Unlike `jobs`, NOTHING is enqueued at boot: the
	 * producer enqueues inside the transaction of the fact that motivates the command (the durable
	 * alternative to an integration event whose only consumer executes an action).
	 */
	commandHandlers?: HandlerRecord
	registry?: InstanceRegistry
	jobs?: JobDefinition[]
	setup?: (container: DependencyContainer) => void | Promise<void>
	/**
	 * A FASE DE START — o que este contexto LIGA quando o boot manda (pumps: pollers, consumers,
	 * transportes). Declarado aqui, executado por `startAll()` — nunca dentro do `create`. A razão é
	 * medida, e veio do repo irmão (S2, medida na F0): quando isto era `setup` em import-time, o
	 * `OutboxDispatcher` pollava antes de o schema existir em TODO boot, e o `emit-openapi` abria
	 * transporte só para gerar um JSON. Import registra; fase liga.
	 *
	 * NOTA DE FASE (spec D6): aqui o `registerJobs` ainda roda no `create`, não no start — a ordem
	 * migrar-antes-de-compor deste repo existe por causa disso, com incidente medido registrado em
	 * `src/compose.ts`. Mover a fase é follow-up nomeado, pré-requisito da simetria com o irmão.
	 */
	start?: (container: DependencyContainer) => void | Promise<void>
	/**
	 * O INVERSO do `start`, e ele existe porque a assimetria custava caro: enquanto a devolução do
	 * que um contexto adquire mora na raiz de composição, a raiz precisa SABER o que cada contexto
	 * ligou — e um contexto novo que adquira um recurso não tem onde devolvê-lo, então ele vaza no
	 * encerramento sem nada avisar.
	 *
	 * Roda em LIFO (ver `shutdownAll`), então um contexto sempre se desfaz antes daquele de quem ele
	 * depende. Não feche pool de banco aqui: isso é de processo, é o ÚLTIMO passo, e continua sendo
	 * da raiz.
	 */
	shutdown?: (container: DependencyContainer) => void | Promise<void>
}

/** O que falhou ao desligar. `shutdownAll` devolve isto; quem decide o exit code é a raiz. */
export interface ShutdownFailure {
	context: string
	error: unknown
}

/**
 * SELEÇÃO DE AMBIENTE DO BOOT (spec Decision 6). O default é `real` e o caller de produção não
 * muda: a seleção é uma CHAMADA explícita feita ANTES dos imports dos contextos (os boots são
 * side-effect de módulo), nunca uma env var ambiente. Qualquer ambiente NÃO-real sob produção é
 * recusado — um servidor real com bindings em memória (ou de e2e) seria o desastre silencioso.
 * Consumidores: o harness de integração do console (`@codm/api-typescript/testing`), o Playwright
 * do e2e (`CODM_ENV=e2e`).
 */
export type BoundedContextEnvironment = 'real' | 'integration' | 'e2e'

let selectedEnvironment: BoundedContextEnvironment = 'real'

export function setBoundedContextEnvironment(env: BoundedContextEnvironment): void {
	if (env !== 'real' && process.env.NODE_ENV === 'production') {
		throw new Error(`setBoundedContextEnvironment: ${env} é recusado sob NODE_ENV=production`)
	}
	selectedEnvironment = env
}

export function getBoundedContextEnvironment(): BoundedContextEnvironment {
	return selectedEnvironment
}

/**
 * Dispatch declarado sobre o eixo (NN-5): edge case por ambiente vira coluna preenchida, nunca
 * `if (process.env.X)`. Consumidores: montagem de controllers de teste (`shared/index.ts`,
 * `agent/index.ts`).
 */
export function byEnvironment<T>(columns: { default: T } & Partial<Record<BoundedContextEnvironment, T>>): T {
	return columns[getBoundedContextEnvironment()] ?? columns.default
}

export class BoundedContext {
	private started = false

	private constructor(
		readonly container: DependencyContainer,
		readonly router: Router,
		readonly name: string,
		private readonly onStart?: (container: DependencyContainer) => void | Promise<void>,
		private readonly onShutdown?: (container: DependencyContainer) => void | Promise<void>,
	) {}

	/**
	 * Liga o que este contexto declarou. PERMANENTE e idempotente: um segundo start é no-op, e um
	 * contexto desligado não ressuscita.
	 */
	async start(): Promise<void> {
		if (this.started) return
		this.started = true
		await this.onStart?.(this.container)
	}

	/** Devolve o que este contexto adquiriu no `start`. Sem hook declarado, é no-op. */
	async shutdown(): Promise<void> {
		await this.onShutdown?.(this.container)
	}

	/**
	 * Liga os contextos em FIFO — a ordem de composição, que é a mesma que o `compose.ts` já usa
	 * (raiz primeiro: é ela que aplica os registries e sobe a infra que os demais consomem).
	 *
	 * ASSIMETRIA DELIBERADA com o `shutdownAll`: desligamento DRENA tudo e coleciona falhas;
	 * ligamento FALHA RÁPIDO — um boot com pump quebrado não pode meio-subir.
	 */
	static async startAll(contexts: readonly BoundedContext[]): Promise<void> {
		for (const context of contexts) {
			try {
				await context.start()
			} catch (error) {
				throw new Error(`BoundedContext.startAll: o start de '${context.name}' falhou — boot abortado`, { cause: error })
			}
		}
	}

	/**
	 * Desliga os contextos em LIFO — o inverso da ordem em que foram criados, de modo que um
	 * contexto sempre se desfaz antes daquele de quem ele depende. A ordem de criação já é declarada
	 * pelo `compose.ts`, então o LIFO sai de graça e sem registro global novo.
	 *
	 * MECANISMO, NÃO POLÍTICA. Cada contexto é isolado num try/catch para que um recurso quebrado
	 * não aborte a drenagem dos outros, e as falhas voltam numa lista. Decidir se isso vira exit 1 é
	 * da raiz de composição, que é quem conhece o processo.
	 */
	static async shutdownAll(contexts: readonly BoundedContext[]): Promise<ShutdownFailure[]> {
		const failures: ShutdownFailure[] = []
		for (const context of [...contexts].reverse()) {
			try {
				await context.shutdown()
			} catch (error) {
				failures.push({ context: context.name, error })
			}
		}
		return failures
	}

	/**
	 * FASE A — LIGA os bindings de TODOS os contextos, e não monta nenhum (ADR 0007).
	 *
	 * ── o defeito que isto elimina, e ele custou um 500 em produção ──────────────────────────────
	 * Até aqui, `create` fazia as duas coisas numa chamada só: registrava o registry DESTE contexto e
	 * em seguida construía o Router — que resolve todo controller SINCRONAMENTE. Enquanto o contexto
	 * N montava, os registries de N+1..10 ainda não existiam. Uma cadeia cross-context alcançada
	 * nesse meio (`AuthPassthroughController → BetterAuth → IdentityAuthHooks → OwnerDirectory`)
	 * resolvia um token sem binding, e aí três coisas conspiram:
	 *
	 *   1. o tsyringe constrói a classe ABSTRATA sem reclamar — objeto sem método nenhum;
	 *   2. o `Router.registerControllers` ENGOLE a falha com `console.warn`;
	 *   3. o sintoma aparece na primeira CHAMADA, não no boot.
	 *
	 * Medido: `this.owners.ensureOwnerFor is not a function`, 500 no callback do Google depois de o
	 * operador já ter autorizado.
	 *
	 * Com as duas fases, nenhum token pode ser resolvido antes de existir. A classe de defeito morre
	 * POR CONSTRUÇÃO — não por um guard que alguém precisa lembrar de pôr.
	 *
	 * ── e um hack que morre junto ────────────────────────────────────────────────────────────────
	 * Registrar contexto a contexto significava RE-registrar tokens no container raiz depois de
	 * alguém já os ter resolvido, e re-registrar um singleton descarta a instância em cache. Era daí
	 * que vinha o pin do driver (`shared/lifecycle.ts`, agora apagado) e o `mailboxDispatcher`
	 * reportando `down` para sempre. Uma passada só de registro remove a causa dos dois.
	 *
	 * Registra sempre no container RAIZ, que é onde `create` já registrava mesmo para não-root — o
	 * conjunto de bindings é idêntico ao de antes; o que mudou foi QUANDO.
	 */
	static bindAll(descriptors: readonly BoundedContextOptions<string>[]): void {
		for (const options of descriptors) {
			if (options.registry) registerAll(rootContainer, options.registry[selectedEnvironment])
		}
	}

	/**
	 * FASE B — monta UM contexto. Não registra nada: quem liga é o `bindAll` (ADR 0007).
	 */
	static async create<TName extends string = string>(options: BoundedContextOptions<TName>): Promise<BoundedContext> {
		const container = options.root ? rootContainer : rootContainer.createChildContainer()

		autoTrace(container)

		await BoundedContext.registerHandlers(container, options)
		await BoundedContext.registerProjectors(container, options)
		await BoundedContext.registerJobs(container, options.jobs)
		await BoundedContext.registerCommandHandlers(container, options)
		await options.setup?.(container)

		const router = new Router(options.name, container, options.controllers, options.middlewares, options.skipMiddlewares)

		return new BoundedContext(container, router, options.name, options.start, options.shutdown)
	}

	private static async registerHandlers(container: DependencyContainer, options: BoundedContextOptions): Promise<void> {
		if (!options.internalHandlers && !options.externalHandlers) return

		if (options.internalHandlers) {
			const mediator = resolve(container, InternalMediator)
			await Mediator.register(container, mediator, options.internalHandlers)
		}

		if (options.externalHandlers) {
			const mediator = resolve(container, ExternalMediator)
			await Mediator.register(container, mediator, options.externalHandlers)
		}
	}

	private static async registerProjectors(container: DependencyContainer, options: BoundedContextOptions): Promise<void> {
		if (!options.projectors) return

		const mediator = resolve(container, InternalMediator)
		let successCount = 0

		for (const [projectorName, ProjectorClass] of Object.entries(options.projectors)) {
			if (typeof ProjectorClass !== 'function' || projectorName === 'default') continue

			const result = tryCatch(() => {
				const projectorInstance = container.resolve(ProjectorClass) as Projector

				for (const eventName of projectorInstance.events) {
					// Wrap the projector as a minimal Handler-compatible object for mediator.register
					const pseudoHandler = {
						name: eventName,
						bindContainer: (_c: DependencyContainer) => pseudoHandler,
						execute: async (input: any) => {
							await projectorInstance.handle(input)
						},
					} as any
					mediator.register(pseudoHandler)
				}

				successCount++
			})

			if (!result.success) {
				console.warn(`Failed to resolve Projector ${projectorName}:`, result.error)
			}
		}

		console.log(`✅ Registered ${successCount} Projectors`)
	}

	private static async registerJobs(container: DependencyContainer, jobs?: JobDefinition[]): Promise<void> {
		if (!jobs?.length) return

		// Spec generation (emit-openapi / bun sdk) imports the composition root ONLY to collect
		// routers. Registering repeatable jobs is a runtime side-effect — it resolves the real
		// CommandQueue and enqueues repeat commands to the actual queue (Redis/Postgres), which is
		// absent during emission and produces no routes. Skip it, exactly like the EMIT_OPENAPI guard
		// in OpenAPI.generateSpecification.
		if (process.env.EMIT_OPENAPI === 'true') return

		const commandQueue = resolve(container, CommandQueue)

		for (const job of jobs) {
			const handler = container.resolve(job.handler).bindContainer(container)
			await commandQueue.registerCommandHandler(handler)
			await commandQueue.enqueueCommand(handler.name, {}, { repeat: resolveJobCadence(job) })
		}
	}

	private static async registerCommandHandlers(container: DependencyContainer, options: BoundedContextOptions): Promise<void> {
		if (!options.commandHandlers) return

		// Same guard as registerJobs: spec emission (emit-openapi / bun sdk) imports the composition root
		// ONLY to collect routers, and registering a command handler STARTS the queue's poller against a
		// database emission has no business opening.
		if (process.env.EMIT_OPENAPI === 'true') return

		const commandQueue = resolve(container, CommandQueue)
		// The static helper resolves + binds each handler's container and registers it — it has existed
		// since the queue was written and this is its first call site.
		await CommandQueue.registerCommandHandler(container, commandQueue, options.commandHandlers)
	}
}
