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
	registry?: InstanceRegistry
	jobs?: JobDefinition[]
	setup?: (container: DependencyContainer) => void | Promise<void>
}

export class BoundedContext {
	private constructor(
		readonly container: DependencyContainer,
		readonly router: Router,
	) {}

	static async create<TName extends string = string>(options: BoundedContextOptions<TName>): Promise<BoundedContext> {
		const container = options.root ? rootContainer : rootContainer.createChildContainer()

		if (options.registry) {
			registerAll(options.root ? container : rootContainer, options.registry.real)
		}

		autoTrace(container)

		await BoundedContext.registerHandlers(container, options)
		await BoundedContext.registerProjectors(container, options)
		await BoundedContext.registerJobs(container, options.jobs)
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
}
