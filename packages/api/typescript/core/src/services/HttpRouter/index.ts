export * from './FastifyHttpRouter'

import { Controller } from '../../types/Controller'
import { type HttpMethod } from '../../types/Http'
import { Middleware } from '../../types/Middleware'
import { Router } from '../../types/Router'

export abstract class HttpRouter {
	abstract on: (
		path: string,
		method: HttpMethod | HttpMethod[],
		controller: Controller,
		middlewares?: Middleware[],
		router?: Router,
	) => void

	abstract listen: (port: number) => Promise<void>
	abstract stop: () => Promise<void>
}
