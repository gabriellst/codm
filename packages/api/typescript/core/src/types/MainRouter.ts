import { Config } from '../utils/Config'
import { HttpRouter } from '../services/HttpRouter'
import { injectable } from 'tsyringe-neo'
import { Middleware, MiddlewareClass } from './Middleware'
import { Router } from './Router'

interface MainRouterConfig {
	httpRouter: HttpRouter
	version: string
	routers: Router[]
	middlewares?: (Middleware | MiddlewareClass)[]
}

@injectable()
export class MainRouter {
	constructor(readonly config: MainRouterConfig) {}

	async start(): Promise<void> {
		this.configureRoutes()
		await this.config.httpRouter.listen(Config.env.API_PORT)
	}

	/**
	 * Stop the HTTP server gracefully.
	 * Call this during graceful shutdown.
	 */
	async stop(): Promise<void> {
		await this.config.httpRouter.stop()
	}

	private configureRoutes(): void {
		this.config.routers.forEach(router => {
			this.configureRouterControllers(router)
		})
	}

	private configureRouterControllers(router: Router): void {
		const globalMiddlewares = this.config?.middlewares ?? []
		const routerMiddlewares = router?.middlewares ?? []
		const routerSkipMiddlewares = router?.skipMiddlewares ?? []
		const sharedMiddlewares = [...globalMiddlewares, ...routerMiddlewares]

		router.controllers?.forEach(controller => {
			const controllerDefinedMiddlewares = controller.middlewares ?? []
			const controllerOwnNames = new Set(controllerDefinedMiddlewares.map(m => this.getMiddlewareName(m)))

			// Deduplicate middlewares: controller middlewares take precedence over shared ones
			const deduplicatedShared = sharedMiddlewares.filter(m => !controllerOwnNames.has(this.getMiddlewareName(m)))
			const currentControllerMiddlewares = [...deduplicatedShared, ...controllerDefinedMiddlewares]

			const controllerSkip = controller.skipMiddlewares ?? []
			const skipNames = new Set(controllerSkip.map(skip => this.getMiddlewareName(skip)))

			routerSkipMiddlewares.forEach(skipMiddleware => {
				const skipName = this.getMiddlewareName(skipMiddleware)
				// Don't add to skip if controller explicitly defines this middleware (controller preference)
				if (controllerOwnNames.has(skipName) || skipNames.has(skipName)) {
					return
				}
				controllerSkip.push(skipMiddleware)
				skipNames.add(skipName)
			})

			controller.middlewares = currentControllerMiddlewares
			controller.skipMiddlewares = controllerSkip

			const completePath = `/${this.config.version}${router.path === '/' ? '' : router.path}${controller.path}`
			this.config.httpRouter.on(completePath, controller.method, controller)
		})
	}

	private getMiddlewareName(middleware: Middleware | MiddlewareClass): string {
		if (typeof middleware === 'function') {
			return middleware.name
		}
		return middleware.constructor.name
	}
}
