// Recipe: dev:packages/api/src/auth/middlewares/AuthAccountMiddleware.ts
// Simplified: video-streaming has a flat actor model (user = actor, no clinic-switching).
import { singleton } from 'tsyringe-neo'
import { BaseError } from '@template/core-typescript'
import type { HttpControllerRequest, HttpMiddlewareResponse } from '@template/core-typescript'
import type { Middleware } from '@template/core-typescript'
import type { BaseInterfaceErrors } from '@template/core-typescript'
import { SessionSchema } from '@auth/schemas'
import { BetterAuth } from '../services/Authentication/BetterAuth'

/**
 * Validates the better-auth session and attaches the canonical
 * SessionSchema shape to request.ctx:
 *   ctx.user    — { id, email, name, emailVerified }
 *   ctx.session — { id, userId, expiresAt }
 *
 * Downstream consumers read `ctx.user.id` (not `ctx.session.userId`).
 * See SPEC-05.
 */
@singleton()
export class AuthAccountMiddleware implements Middleware {
	constructor(private betterAuth: BetterAuth) {}

	async execute(request: HttpControllerRequest<unknown>): Promise<HttpMiddlewareResponse<void>> {
		const response = await this.betterAuth.auth.api.getSession({
			headers: request.raw.headers as Headers,
			asResponse: true,
		})

		if (!response.ok) {
			throw new BaseError<BaseInterfaceErrors>('UNAUTHORIZED')
		}

		const rawSession = await response.json()

		// Parse the better-auth response with the RAW shape it actually emits: the additionalField
		// is `activeOwnerId`; `ownerId` is OUR name, mapped below when building request.ctx — the
		// raw payload never carries it (requiring it rejected every session: 'Invalid session
		// structure' on all owner-scoped routes, caught by the first real e2e run).
		const BetterAuthSessionSchema = SessionSchema.extend({
			session: SessionSchema.shape.session.omit({ ownerId: true }).extend({
				activeOwnerId: SessionSchema.shape.session.shape.ownerId.optional(),
			}),
		})

		const validated = BetterAuthSessionSchema.safeParse(rawSession)

		if (!validated.success) {
			throw new BaseError<BaseInterfaceErrors>('UNAUTHORIZED', 'Invalid session structure')
		}

		request.ctx = {
			...request.ctx,
			user: validated.data.user,
			session: {
				id: validated.data.session.id,
				userId: validated.data.session.userId,
				expiresAt: validated.data.session.expiresAt,
				ownerId: validated.data.session.activeOwnerId ?? null,
			},
		}

		return {}
	}
}
