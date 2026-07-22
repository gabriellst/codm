// Better-auth passthrough. Mounts under /v1/authentication/* (MainRouter prepends
// the /v1 version prefix to the version-relative `/authentication/*` path), matching
// Config.env.BETTER_AUTH_URL and the frontend auth client's baseURL. Forwards the raw
// Web Request to better-auth and returns its Response untouched — executeController
// detects `instanceof Response` and returns it directly.
import { injectable } from 'tsyringe-neo'
import { z, Controller, BaseError, tryCatchAsync, RateLimitMiddleware } from '@template/core-typescript'
import type { HttpMethod, BaseInterfaceErrors, Middleware, MiddlewareClass } from '@template/core-typescript'
import { BetterAuth } from '../services/Authentication/BetterAuth'

export const AuthControllerInput = z.unknown().example([{}])
export const AuthControllerOutput = z.unknown().example([{}])

@injectable()
export class AuthController extends Controller<typeof AuthControllerInput, typeof AuthControllerOutput> {
	readonly path = '/authentication/*'
	readonly method: HttpMethod[] = ['get', 'post']
	readonly description = 'Auth operations (better-auth passthrough)'
	readonly inputSchema = AuthControllerInput
	readonly outputSchema = AuthControllerOutput
	override middlewares: (Middleware | MiddlewareClass)[] = [RateLimitMiddleware]

	constructor(private betterAuth: BetterAuth) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const result = await tryCatchAsync<Response>(() => this.betterAuth.auth.handler(request.raw))
		if (!result.success) throw new BaseError<BaseInterfaceErrors>('UNAUTHORIZED', result.error.message)
		// executeController detects Response instances and returns them directly.
		return this.rawResponse(result.data)
	}
}
