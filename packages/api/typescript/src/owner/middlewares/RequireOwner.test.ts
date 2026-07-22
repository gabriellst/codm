import { describe, it, expect, mock } from 'bun:test'
import { RequireOwner } from './RequireOwner'
import type { OwnerRepository } from '@owner/repositories/OwnerRepository'
import type { HttpControllerRequest } from '@template/core-typescript'
import { testId } from '@test/support'

const RESPONSIBLE_USER_ID = 'user-1'

/**
 * Minimal OwnerRepository double. `findByOwnerId` returns an object shaped like the
 * slice of `Owner` the middleware reads (`responsibleUserId`), or `null` on a miss.
 */
function makeRepo(opts: { found: boolean; responsibleUserId?: string }): OwnerRepository {
	return {
		findByOwnerId: mock(async (_ownerId: string) =>
			opts.found ? ({ responsibleUserId: opts.responsibleUserId ?? RESPONSIBLE_USER_ID } as never) : null,
		),
	} as unknown as OwnerRepository
}

const VALID_USER_ID = testId('user', '1')
const VALID_EXPIRES_AT = new Date('2099-01-01T00:00:00.000Z')

/** Full SessionSchema-compliant ctx with a specific ownerId (or null). */
function makeCtx(ownerId: string | null) {
	return {
		user: { id: RESPONSIBLE_USER_ID, email: 'a@b.com', name: 'Alice', emailVerified: true },
		session: { id: 's-1', userId: VALID_USER_ID, expiresAt: VALID_EXPIRES_AT, ownerId },
	}
}

function makeRequest(ctx: unknown, params: unknown = {}, body: unknown = {}): HttpControllerRequest<unknown> {
	return { ctx, params, body, raw: {} } as unknown as HttpControllerRequest<unknown>
}

describe('RequireOwner', () => {
	it('throws FORBIDDEN when ctx has no user', async () => {
		const mw = new RequireOwner(makeRepo({ found: true }))
		const req = makeRequest(
			{
				/* no user */
			},
			{ ownerId: 'owner-1' },
		)
		await expect(mw.execute(req)).rejects.toMatchObject({ name: 'FORBIDDEN' })
	})

	it('throws FORBIDDEN when ctx.session.ownerId is null', async () => {
		const mw = new RequireOwner(makeRepo({ found: true }))
		const req = makeRequest(makeCtx(null))
		await expect(mw.execute(req)).rejects.toMatchObject({ name: 'FORBIDDEN' })
	})

	it('throws OWNER_NOT_FOUND when the owner does not exist', async () => {
		const mw = new RequireOwner(makeRepo({ found: false }))
		const req = makeRequest(makeCtx('owner-1'))
		await expect(mw.execute(req)).rejects.toMatchObject({ name: 'OWNER_NOT_FOUND' })
	})

	it('throws FORBIDDEN when the user is not the responsible user', async () => {
		const mw = new RequireOwner(makeRepo({ found: true, responsibleUserId: 'someone-else' }))
		const req = makeRequest(makeCtx('owner-1'))
		await expect(mw.execute(req)).rejects.toMatchObject({ name: 'FORBIDDEN' })
	})

	it('stamps ctx.ownerId when the user is the responsible user', async () => {
		const mw = new RequireOwner(makeRepo({ found: true }))
		const req = makeRequest(makeCtx('owner-1'))
		await mw.execute(req)
		expect((req.ctx as any).ownerId).toBe('owner-1')
	})
})
