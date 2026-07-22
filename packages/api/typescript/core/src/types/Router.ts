import type { ZodType } from 'zod'
import { DependencyContainer } from 'tsyringe-neo'
import { Controller } from './Controller'
import { Middleware, MiddlewareClass } from './Middleware'

type Constructor<T = object> = new (...args: any[]) => T
type MiddlewareInput = Record<string, Constructor<Middleware>> | MiddlewareClass[]

export class Router {
	path: string
	/** Context identity — the OpenAPI tag and log label. NEVER a mount prefix. */
	readonly name: string
	controllers?: Controller[]
	middlewares?: (Middleware | MiddlewareClass)[]
	skipMiddlewares?: (Middleware | MiddlewareClass)[]

	constructor(
		name: string,
		container: DependencyContainer,
		controllers?: Record<string, Constructor<Controller<ZodType, ZodType>>>,
		middlewares?: MiddlewareInput,
		skipMiddlewares?: MiddlewareInput,
	) {
		console.log(`\n🚀 Starting ${name} Module Router\n`)
		this.name = name.trim()
		// Route vocabulary lives ENTIRELY on controller paths (one convention, no per-context
		// mount prefixes) — the router itself never adds a segment.
		this.path = ''
		this.resolve(container, controllers, middlewares, skipMiddlewares)
	}

	private resolve(
		container: DependencyContainer,
		controllers?: Record<string, Constructor<Controller<ZodType, ZodType>>>,
		middlewares?: MiddlewareInput,
		skipMiddlewares?: MiddlewareInput,
	) {
		// Register controllers first
		if (controllers && Object.keys(controllers).length > 0) {
			this.registerControllers(container, controllers)
		}

		// Register middlewares and apply them to all controllers
		if (middlewares && this.hasEntries(middlewares)) {
			this.registerMiddlewares(container, middlewares)
		}

		// Register skip middlewares and propagate to controllers
		if (skipMiddlewares && this.hasEntries(skipMiddlewares)) {
			this.registerSkipMiddlewares(container, skipMiddlewares)
		}
	}

	private hasEntries(input: MiddlewareInput): boolean {
		return Array.isArray(input) ? input.length > 0 : Object.keys(input).length > 0
	}

	private registerControllers(container: DependencyContainer, controllers: Record<string, Constructor<Controller<ZodType, ZodType>>>) {
		const controllerInstances: Controller[] = []
		let successCount = 0

		for (const [controllerName, ControllerClass] of Object.entries(controllers)) {
			if (typeof ControllerClass === 'function' && controllerName !== 'default') {
				try {
					const controllerInstance = container.resolve(ControllerClass).bindContainer(container) as Controller
					controllerInstances.push(controllerInstance)
					successCount++
				} catch (error) {
					console.warn(`Failed to resolve controller ${controllerName}:`, error)
				}
			}
		}

		// Add controllers to router
		if (controllerInstances.length > 0) {
			if (!this.controllers) {
				this.controllers = []
			}
			this.controllers.push(...controllerInstances)
		}

		console.log(`✅ Registered ${successCount} Controllers`)
	}

	private registerMiddlewares(container: DependencyContainer, middlewares: MiddlewareInput) {
		const resolvedMiddlewares = this.resolveMiddlewareInstances(container, middlewares)
		if (resolvedMiddlewares.length === 0) {
			return
		}

		if (!this.middlewares) {
			this.middlewares = []
		}
		this.middlewares.push(...resolvedMiddlewares)
	}

	private registerSkipMiddlewares(container: DependencyContainer, skipMiddlewares: MiddlewareInput) {
		const resolvedSkipMiddlewares = this.resolveMiddlewareInstances(container, skipMiddlewares)
		if (resolvedSkipMiddlewares.length === 0) {
			return
		}

		if (!this.skipMiddlewares) {
			this.skipMiddlewares = []
		}
		this.skipMiddlewares.push(...resolvedSkipMiddlewares)
	}

	private resolveMiddlewareInstances(container: DependencyContainer, middlewares: MiddlewareInput): Middleware[] {
		const resolved: Middleware[] = []

		if (Array.isArray(middlewares)) {
			for (const MiddlewareClass of middlewares) {
				try {
					const middlewareInstance = container.resolve(MiddlewareClass) as Middleware
					resolved.push(middlewareInstance)
				} catch (error) {
					console.warn(`Failed to resolve middleware ${MiddlewareClass.name}:`, error)
				}
			}
		} else {
			for (const [middlewareName, MiddlewareClass] of Object.entries(middlewares)) {
				if (typeof MiddlewareClass === 'function' && middlewareName !== 'default') {
					try {
						const middlewareInstance = container.resolve(MiddlewareClass) as Middleware
						resolved.push(middlewareInstance)
					} catch (error) {
						console.warn(`Failed to resolve middleware ${middlewareName}:`, error)
					}
				}
			}
		}

		return resolved
	}
}
