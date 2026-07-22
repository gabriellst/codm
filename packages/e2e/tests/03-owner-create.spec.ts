import { test, expect } from '../utils/test'
import { createOwner, setActiveOwner, getUserInfo } from '@codedm/client-typescript/typescript'

/**
 * Canonical flow 3 — owner (tenant) lifecycle over the single ownerId axis.
 *
 * API-driven through the operator SDK client: create an Owner, exercise SetActiveOwner, and read the
 * owner list back through the BFF GetUserInfo projection.
 *
 * NOTE on `current`: SetActiveOwner persists `sessions.activeOwnerId`, but the single-operator collapse
 * (founder decision 2) makes OperatorMiddleware stamp a CONSTANT session server-side and GetUserInfo
 * reads `ctx.session.ownerId` from it — the stored active owner is never read back, so "active-owner
 * switching" is a no-op surface under one operator (there is no per-session owner to switch). The call
 * still succeeds (a valid targeted update); the durable, operator-supported fact is that the created
 * owner is LISTED. We assert that, not the removed switch.
 */
test('create owner → set active (no-op under single operator) → owner is listed', async ({ given }) => {
	const user = await given.freshUser({})

	const created = await createOwner({ name: 'E2E Owner' }, { client: user.session.client })
	expect(created.ownerId).toBeTruthy()

	// Succeeds as a targeted update; does not change the operator's constant active owner.
	await setActiveOwner(created.ownerId, { client: user.session.client })

	const info = await getUserInfo({ client: user.session.client })
	expect(info.owners.some(o => o.id === created.ownerId)).toBe(true)
})
