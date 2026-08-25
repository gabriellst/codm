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

	/** Binds the transport and returns the EFFECTIVE port — `port: 0` asks the OS for an ephemeral
	 *  one, and the caller (`MainRouter.start`) needs the real bound port back to report it. */
	abstract listen: (port: number) => Promise<number>
	abstract stop: () => Promise<void>
}
