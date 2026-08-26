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
					// FALHA ALTA, e não `console.warn` (ADR 0007, decisão 3).
					//
					// Este `catch` engolia a falha, e engolir tinha um custo exato: um controller que não
					// resolve simplesmente SOME da rota. O boot termina verde, o processo sobe, e o defeito
					// aparece como 404 numa rota que o desenvolvedor jurava ter registrado — ou, pior, como
					// 500 na primeira chamada, quando um colaborador que o tsyringe construiu a partir de uma
					// classe abstrata sem binding não tem o método pedido.
					//
					// Foi metade do mecanismo do 500 medido no callback do Google: a composição em duas fases
					// mata a causa (token sem binding no meio da montagem), e esta linha mata o SILÊNCIO, que
					// é o que fez a causa sobreviver tanto tempo sem ser vista.
					throw new Error(
						`Router '${this.name}': o controller '${controllerName}' não resolveu, e um controller que não resolve some da rota em silêncio. ` +
							`Confira se todas as dependências dele estão ligadas no registry do contexto — a fase A (\`bindContexts\`) liga todos antes de montar qualquer um.`,
						{ cause: error },
					)
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

	/**
	 * FALHA ALTA também aqui (ADR 0007, decisão 3) — e esta é a metade que faltou no primeiro corte.
	 *
	 * O commit que tornou a resolução de CONTROLLER alta deixou a de middleware engolindo, e a sessão
	 * irmã apontou. Ela tem razão, e o caso é PIOR que o do controller: um controller que some vira
	 * 404, que alguém percebe na primeira chamada. Um middleware que some não quebra a rota — ele a
	 * DESPROTEGE. `AuthAccountMiddleware` fora da cadeia significa autenticação deixando de ser
	 * aplicada, com o endpoint respondendo 200 alegremente. O modo de falha não é "quebrou", é
	 * "passou a aceitar", e nenhum teste de rota o enxerga.
	 *
	 * Os DOIS ramos (lista e registro) engoliam. Os dois passam a derrubar o boot nomeando o
	 * middleware.
	 */
	private resolveMiddlewareInstances(container: DependencyContainer, middlewares: MiddlewareInput): Middleware[] {
		const resolved: Middleware[] = []

		if (Array.isArray(middlewares)) {
			for (const MiddlewareClass of middlewares) {
				try {
					const middlewareInstance = container.resolve(MiddlewareClass) as Middleware
					resolved.push(middlewareInstance)
				} catch (error) {
					throw new Error(
						`Router '${this.name}': o middleware '${MiddlewareClass.name}' não resolveu. Um middleware que não resolve some da CADEIA em silêncio — e um guard ausente não quebra a rota, ele a DESPROTEGE. ` +
							`Confira se as dependências dele estão ligadas no registry do contexto.`,
						{
							cause: error,
						},
					)
				}
			}
		} else {
			for (const [middlewareName, MiddlewareClass] of Object.entries(middlewares)) {
				if (typeof MiddlewareClass === 'function' && middlewareName !== 'default') {
					try {
						const middlewareInstance = container.resolve(MiddlewareClass) as Middleware
						resolved.push(middlewareInstance)
					} catch (error) {
						throw new Error(
							`Router '${this.name}': o middleware '${middlewareName}' não resolveu. Um middleware que não resolve some da CADEIA em silêncio — e um guard ausente não quebra a rota, ele a DESPROTEGE. ` +
								`Confira se as dependências dele estão ligadas no registry do contexto.`,
							{ cause: error },
						)
					}
				}
			}
		}

		return resolved
	}
}
