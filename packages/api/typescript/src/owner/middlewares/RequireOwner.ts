import { singleton } from 'tsyringe-neo'
import { BaseError } from '@template/core-typescript'
import type { HttpControllerRequest, HttpMiddlewareResponse, Middleware, BaseInterfaceErrors } from '@template/core-typescript'
import { OwnerRepository } from '@owner/repositories/OwnerRepository'
import type { ApplicationErrors } from '@owner/errors'
import { SessionSchema } from '@auth/schemas'

/**
 * Owner gate — the base template's single-tenant authorization primitive. It:
 *   1. Parses `request.ctx` against `SessionSchema` (requires `user.id` and the
 *      active `session.ownerId`).
 *   2. Loads the `Owner` for that `ownerId`.
 *   3. Asserts the authenticated user is the tenant's `responsibleUserId`.
 *   4. On a hit, stamps `request.ctx.ownerId` for downstream controllers.
 *
 * The base models one responsible user per Owner (D2) — there is no member /
 * role axis here. Products that need multi-user tenants with roles and invites
 * graft the multi-user tenant exemplar under `examples/` (RequireOwnerMember +
 * RequireOwnerRole) in its place.
 *
 * Composition rule: `AuthAccountMiddleware` first (provides `user.id` +
 * `session.ownerId`), then this.
 */
@singleton()
export class RequireOwner implements Middleware {
	constructor(private readonly owners: OwnerRepository) {}

	async execute(request: HttpControllerRequest<unknown>): Promise<HttpMiddlewareResponse<void>> {
		const ctx = SessionSchema.safeParse(request.ctx)
		if (!ctx.success) throw new BaseError<BaseInterfaceErrors>('FORBIDDEN')

		const userId = ctx.data.user.id
		const ownerId = ctx.data.session.ownerId
		if (!ownerId) throw new BaseError<BaseInterfaceErrors>('FORBIDDEN')

		const owner = await this.owners.findByOwnerId(ownerId)
		if (!owner) throw new BaseError<ApplicationErrors>('OWNER_NOT_FOUND')
		if (owner.responsibleUserId !== userId) throw new BaseError<BaseInterfaceErrors>('FORBIDDEN')

		request.ctx = { ...request.ctx, ownerId }
		return {}
	}
}
