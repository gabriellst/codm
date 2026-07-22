import { test as base, expect } from '@playwright/test'
import { test } from '../utils/test'
import { createOwner, setActiveOwner, getUserInfo } from '@codedm/client-typescript/typescript'

/**
 * Canonical flow 3 — owner (tenant) lifecycle over the single ownerId axis.
 *
 * API-driven through the authenticated SDK client: create an Owner, make it the session's
 * active owner, and read it back through the BFF GetUserInfo projection.
 */
base.describe.configure({ mode: 'serial' })

test('create owner → set active → visible via GetUserInfo', async ({ given }) => {
	const user = await given.freshUser({})

	const created = await createOwner({ name: 'E2E Owner' }, { client: user.session.client })
	expect(created.ownerId).toBeTruthy()

	await setActiveOwner(created.ownerId, { client: user.session.client })

	const info = await getUserInfo({ client: user.session.client })
	expect(info.owners.some(o => o.id === created.ownerId)).toBe(true)
	expect(info.current?.id).toBe(created.ownerId)
})
