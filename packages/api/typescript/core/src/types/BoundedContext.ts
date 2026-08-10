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

type Constructor<T = object> = new (...args: any[]) => T
type MiddlewareInput = Record<string, Constructor<Middleware>> | MiddlewareClass[] | []
type HandlerRecord = Record<string, new (...args: any[]) => Handler>

export interface JobDefinition {
	handler: new (...args: any[]) => Handler
	repeat: { every: number } | { pattern: string }
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
	private constructor(
		readonly container: DependencyContainer,
		readonly router: Router,
	) {}

	static async create<TName extends string = string>(options: BoundedContextOptions<TName>): Promise<BoundedContext> {
		const container = options.root ? rootContainer : rootContainer.createChildContainer()

		if (options.registry) {
			registerAll(options.root ? container : rootContainer, options.registry[selectedEnvironment])
		}

		autoTrace(container)

		await BoundedContext.registerHandlers(container, options)
		await BoundedContext.registerProjectors(container, options)
		await BoundedContext.registerJobs(container, options.jobs)
		await BoundedContext.registerCommandHandlers(container, options)
		await options.setup?.(container)

		const router = new Router(options.name, container, options.controllers, options.middlewares, options.skipMiddlewares)

		return new BoundedContext(container, router)
	}

	private static async registerHandlers(container: DependencyContainer, options: BoundedContextOptions): Promise<void> {
		if (!options.internalHandlers && !options.externalHandlers) return

		if (options.internalHandlers) {
			const mediator = container.resolve(InternalMediator as any) as InternalMediator
			await Mediator.register(container, mediator, options.internalHandlers)
		}

		if (options.externalHandlers) {
			const mediator = container.resolve(ExternalMediator as any) as ExternalMediator
			await Mediator.register(container, mediator, options.externalHandlers)
		}
	}

	private static async registerProjectors(container: DependencyContainer, options: BoundedContextOptions): Promise<void> {
		if (!options.projectors) return

		const mediator = container.resolve(InternalMediator as any) as InternalMediator
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

		const commandQueue = container.resolve(CommandQueue as any) as CommandQueue

		for (const job of jobs) {
			const handler = container.resolve(job.handler).bindContainer(container)
			await commandQueue.registerCommandHandler(handler)
			await commandQueue.enqueueCommand(handler.name, {}, { repeat: job.repeat })
		}
	}

	private static async registerCommandHandlers(container: DependencyContainer, options: BoundedContextOptions): Promise<void> {
		if (!options.commandHandlers) return

		// Same guard as registerJobs: spec emission (emit-openapi / bun sdk) imports the composition root
		// ONLY to collect routers, and registering a command handler STARTS the queue's poller against a
		// database emission has no business opening.
		if (process.env.EMIT_OPENAPI === 'true') return

		const commandQueue = container.resolve(CommandQueue as any) as CommandQueue
		// The static helper resolves + binds each handler's container and registers it — it has existed
		// since the queue was written and this is its first call site.
		await CommandQueue.registerCommandHandler(container, commandQueue, options.commandHandlers)
	}
}
