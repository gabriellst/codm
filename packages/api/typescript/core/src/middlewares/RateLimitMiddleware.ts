import { singleton } from 'tsyringe-neo'
import { z } from 'zod'
import { BaseError } from '../types/BaseError'
import { Config } from '../utils/Config'
import type { BaseInterfaceErrors } from '../errors/codes'
import type { HttpControllerRequest, HttpMiddlewareResponse } from '../types/Http'
import type { Middleware } from '../types/Middleware'
import { RateLimitStore } from '../services/RateLimitStore'

/**
 * Per-sub-action brute-force throttle for the Better-Auth passthrough. For a
 * request whose path matches a configured action, it counts hits per client IP
 * and (when present) per email; either counter overflowing rejects with
 * `RATE_LIMITED` (→ 429). Unmatched paths pass through untouched. Fail-open: a
 * store error is logged and the request is allowed, so a Redis outage never
 * locks users out of auth.
 */
interface RateLimitAction {
	/** Matched against the request path via `includes`. */
	match: string
	max: number
	windowMs: number
}

const MINUTE = 60_000

const ACTIONS: readonly RateLimitAction[] = [
	{ match: '/authentication/sign-in/email', max: 5, windowMs: MINUTE },
	{ match: '/authentication/sign-up/email', max: 5, windowMs: 15 * MINUTE },
	{ match: '/authentication/forget-password', max: 3, windowMs: 15 * MINUTE },
]

@singleton()
export class RateLimitMiddleware implements Middleware {
	constructor(private store: RateLimitStore) {}

	async execute(request: HttpControllerRequest<unknown>): Promise<HttpMiddlewareResponse<void>> {
		const path = this.pathOf(request)
		if (Config.env.RATE_LIMIT_DISABLED) return {}

		const action = ACTIONS.find(a => path.includes(a.match))
		if (!action) return {}

		const ip = this.clientIp(request)
		const email = this.email(request)

		const keys = [`${action.match}:ip:${ip}`]
		if (email) keys.push(`${action.match}:email:${email}`)

		try {
			for (const key of keys) {
				const result = await this.store.hit(key, action.windowMs, action.max)
				if (!result.allowed) throw new BaseError<BaseInterfaceErrors>('RATE_LIMITED')
			}
		} catch (error) {
			if (error instanceof BaseError) throw error
			// Fail-open on infrastructure failure (e.g. Redis unreachable).
			console.warn('[RateLimitMiddleware] store error — allowing request (fail-open):', error)
		}
		return {}
	}

	private pathOf(request: HttpControllerRequest<unknown>): string {
		try {
			return new URL(request.url).pathname
		} catch {
			return request.url ?? ''
		}
	}

	private clientIp(request: HttpControllerRequest<unknown>): string {
		const forwarded = request.headers?.['x-forwarded-for']
		if (forwarded) return forwarded.split(',')[0]!.trim()
		return 'unknown'
	}

	private email(request: HttpControllerRequest<unknown>): string | undefined {
		const result = z.object({ email: z.string() }).safeParse(request.body)
		if (!result.success) return undefined
		const email = result.data.email
		return email.length > 0 ? email.toLowerCase() : undefined
	}
}
