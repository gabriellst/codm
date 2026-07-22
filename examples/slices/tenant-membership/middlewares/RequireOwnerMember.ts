// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { singleton } from 'tsyringe-neo'
import { BaseError } from '@codedm/core-typescript'
import type { HttpControllerRequest, HttpMiddlewareResponse, Middleware } from '@codedm/core-typescript'
import { OwnerMembershipRepository } from '@owner/repositories/OwnerMembershipRepository'
import type { ApplicationErrors } from '@owner/errors'
import { SessionSchema } from '@auth/schemas'

/**
 * Owner gate — foundation of the ownerId-from-session convention. It:
 *   1. Parses `request.ctx` against `SessionSchema` (requires `user.id` and the
 *      active `session.ownerId`).
 *   2. Asserts the user is a member of that owner via `findByOwnerAndUser`.
 *   3. On a miss (or any parse failure), throws `OWNER_MEMBERSHIP_NOT_FOUND` (→ 404).
 *   4. On a hit, stamps `request.ctx.membership = { id, userId, role, ownerIds }`
 *      for `RequireOwnerRole` and any controller that still needs the role or the
 *      full list of owners the user belongs to.
 *
 * Owner-scoped controllers no longer read `ctx.membership.ownerId` — the active
 * owner is `ctx.session.ownerId`, which this middleware has already validated.
 *
 * Composition rule: `AuthAccountMiddleware` first (provides `user.id` +
 * `session.ownerId`), then this; `RequireOwnerRole` goes after to enforce the
 * role allow-list.
 */
@singleton()
export class RequireOwnerMember implements Middleware {
	constructor(private readonly memberships: OwnerMembershipRepository) {}

	async execute(request: HttpControllerRequest<unknown>): Promise<HttpMiddlewareResponse<void>> {
		const ctx = SessionSchema.safeParse(request.ctx)
		if (!ctx.success) throw new BaseError<ApplicationErrors>('OWNER_MEMBERSHIP_NOT_FOUND')

		const userId = ctx.data.user.id
		const ownerId = ctx.data.session.ownerId
		if (!ownerId) throw new BaseError<ApplicationErrors>('OWNER_MEMBERSHIP_NOT_FOUND')

		const active = await this.memberships.findByOwnerAndUser(ownerId, userId)
		if (!active) throw new BaseError<ApplicationErrors>('OWNER_MEMBERSHIP_NOT_FOUND')

		const all = await this.memberships.findByUserId(userId)
		const ownerIds = all.map(m => m.ownerId)

		request.ctx = {
			...request.ctx,
			ownerId,
			membership: { id: active.id, userId: active.userId, role: active.role, ownerIds },
		}
		return {}
	}
}
