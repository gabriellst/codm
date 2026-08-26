import { Config } from '../utils/Config'
import { HttpRouter } from '../services/HttpRouter'
import { injectable } from 'tsyringe-neo'
import { Middleware, MiddlewareClass } from './Middleware'
import { Router } from './Router'

interface MainRouterConfig {
	httpRouter: HttpRouter
	routers: Router[]
	middlewares?: (Middleware | MiddlewareClass)[]
}

@injectable()
export class MainRouter {
	constructor(readonly config: MainRouterConfig) {}

	/**
	 * `port` overrides `Config.env.API_PORT` — the seam `start()` (src/server.ts) uses to hand the
	 * harness/e2e an ephemeral `0` instead of the production port. Returns the EFFECTIVE bound port
	 * (relevant when `port` is `0`), so the caller can report the real listening address.
	 */
	async start(port?: number): Promise<number> {
		this.configureRoutes()
		return this.config.httpRouter.listen(port ?? Config.env.API_PORT)
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

			// O CAMINHO É O QUE O CONTROLLER DECLARA. Não há prefixo de versão.
			//
			// Havia: este trecho montava `/${Config.version}${router.path}${controller.path}`, e o `v1`
			// resultante era redeclarado em outros lugares que tinham de concordar À MÃO — o
			// `openapi.json` (e portanto a SDK) o assava em todos os paths, e quem montasse uma URL fora
			// da SDK o acrescentava por fora. Duas dessas fontes juntas DOBRAM o segmento.
			//
			// E não era versionamento: nada ramificava no valor, não havia v2, nem negociação, nem
			// depreciação — e o gateway Go tem o próprio mount (`/api/{version}`), independente deste.
			//
			// SE UM DIA PRECISAR VERSIONAR: é decisão POR ROTA, no `path` do controller. Versiona-se
			// endpoint, não API inteira, e assim o caminho continua sendo o que está escrito.
			const completePath = `${router.path === '/' ? '' : router.path}${controller.path}`
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
