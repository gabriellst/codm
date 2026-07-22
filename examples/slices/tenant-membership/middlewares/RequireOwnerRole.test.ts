// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { describe, it, expect } from 'bun:test'
import { RequireOwnerRole } from './RequireOwnerRole'
import { Role as OwnerRole } from '../enums/Role'
import type { HttpControllerRequest } from '@codedm/core-typescript'

function makeRequest(ctx: unknown): HttpControllerRequest<unknown> {
	return { ctx, params: {}, body: {}, raw: {} } as unknown as HttpControllerRequest<unknown>
}

describe('RequireOwnerRole', () => {
	const Middleware = RequireOwnerRole([OwnerRole.RESPONSIBLE, OwnerRole.ADMIN])

	it('throws FORBIDDEN when ctx has no membership', async () => {
		const mw = new Middleware()
		const req = makeRequest({})
		await expect(mw.execute(req)).rejects.toMatchObject({ name: 'FORBIDDEN' })
	})

	it('throws FORBIDDEN when ctx.membership has no role', async () => {
		const mw = new Middleware()
		const req = makeRequest({ membership: {} })
		await expect(mw.execute(req)).rejects.toMatchObject({ name: 'FORBIDDEN' })
	})

	it('throws FORBIDDEN when role is not in the allow-list', async () => {
		const mw = new Middleware()
		const req = makeRequest({ membership: { role: OwnerRole.MEMBER } })
		await expect(mw.execute(req)).rejects.toMatchObject({ name: 'FORBIDDEN' })
	})

	it('throws FORBIDDEN when ctx membership shape is completely wrong (type cast bypass)', async () => {
		const mw = new Middleware()
		// Simulates a malformed ctx that old `as` casts would silently accept
		const req = makeRequest({ membership: { role: 42 } })
		await expect(mw.execute(req)).rejects.toMatchObject({ name: 'FORBIDDEN' })
	})

	it('passes when role is in the allow-list', async () => {
		const mw = new Middleware()
		const req = makeRequest({ membership: { role: OwnerRole.RESPONSIBLE } })
		await expect(mw.execute(req)).resolves.toMatchObject({})
	})
})
