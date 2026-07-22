// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { describe, it, expect, mock } from 'bun:test'
import { RequireOwnerMember } from './RequireOwnerMember'
import type { OwnerMembershipRepository } from '@owner/repositories/OwnerMembershipRepository'
import type { HttpControllerRequest } from '@template/core-typescript'
import { testId } from '@test/support'

/**
 * Minimal membership double. Returns plain objects shaped like the slice of
 * `OwnerMembership` the middleware touches (`id`, `userId`, `role`, `ownerId`).
 * `findByOwnerAndUser` is the membership assertion; `findByUserId` feeds the
 * stamped `ownerIds` list.
 */
function makeRepo(hit: boolean): OwnerMembershipRepository {
	const active = { id: 'membership-1', ownerId: 'owner-1', userId: 'user-1', role: 'OWNER' as const }
	return {
		findByOwnerAndUser: mock(async (_ownerId: string, _userId: string) => (hit ? active : undefined)),
		findByUserId: mock(async (_userId: string) => (hit ? [active, { ...active, ownerId: 'owner-2' }] : [])),
	} as unknown as OwnerMembershipRepository
}

const VALID_USER_ID = testId('user', '1')
const VALID_EXPIRES_AT = new Date('2099-01-01T00:00:00.000Z')

/** Full SessionSchema-compliant ctx with a specific ownerId (or null). */
function makeCtx(ownerId: string | null) {
	return {
		user: { id: 'user-1', email: 'a@b.com', name: 'Alice', emailVerified: true },
		session: { id: 's-1', userId: VALID_USER_ID, expiresAt: VALID_EXPIRES_AT, ownerId },
	}
}

function makeRequest(ctx: unknown, params: unknown = {}, body: unknown = {}): HttpControllerRequest<unknown> {
	return { ctx, params, body, raw: {} } as unknown as HttpControllerRequest<unknown>
}

describe('RequireOwnerMember', () => {
	it('throws OWNER_MEMBERSHIP_NOT_FOUND when ctx has no user', async () => {
		const mw = new RequireOwnerMember(makeRepo(true))
		const req = makeRequest(
			{
				/* no user */
			},
			{ ownerId: 'owner-1' },
		)
		await expect(mw.execute(req)).rejects.toMatchObject({ name: 'OWNER_MEMBERSHIP_NOT_FOUND' })
	})

	it('throws OWNER_MEMBERSHIP_NOT_FOUND when ctx.user.id is missing', async () => {
		const mw = new RequireOwnerMember(makeRepo(true))
		const req = makeRequest(
			{
				user: {
					/* no id */
				},
			},
			{ ownerId: 'owner-1' },
		)
		await expect(mw.execute(req)).rejects.toMatchObject({ name: 'OWNER_MEMBERSHIP_NOT_FOUND' })
	})

	it('throws OWNER_MEMBERSHIP_NOT_FOUND when ctx.session.ownerId is null', async () => {
		const mw = new RequireOwnerMember(makeRepo(true))
		const req = makeRequest(makeCtx(null), {}, {})
		await expect(mw.execute(req)).rejects.toMatchObject({ name: 'OWNER_MEMBERSHIP_NOT_FOUND' })
	})

	it('throws OWNER_MEMBERSHIP_NOT_FOUND when membership not found', async () => {
		const mw = new RequireOwnerMember(makeRepo(false))
		const req = makeRequest(makeCtx('owner-1'), {})
		await expect(mw.execute(req)).rejects.toMatchObject({ name: 'OWNER_MEMBERSHIP_NOT_FOUND' })
	})

	it('stamps membership { id, userId, role, ownerIds } when ownerId is a valid member', async () => {
		const mw = new RequireOwnerMember(makeRepo(true))
		const req = makeRequest(makeCtx('owner-1'), {})
		await mw.execute(req)
		const membership = (req.ctx as any).membership
		expect(membership).toMatchObject({ id: 'membership-1', userId: 'user-1', role: 'OWNER' })
		expect(membership.ownerIds).toEqual(['owner-1', 'owner-2'])
		// No longer stamps a single ownerId — controllers read ctx.session.ownerId.
		expect(membership.ownerId).toBeUndefined()
	})
})
