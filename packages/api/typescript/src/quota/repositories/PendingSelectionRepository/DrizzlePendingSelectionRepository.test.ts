import { TestBed } from '@test/support'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'

import { PendingSelectionRepository } from './PendingSelectionRepository'
import { QuotaKey } from '@template/contracts-typescript/wire/enums'

describe('DrizzlePendingSelectionRepository', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let repo: PendingSelectionRepository

	const OWNER = 'owner-pending-selection-1'

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', {
			testContainer,
			ownerId: 'integration-tenant',
		})
		repo = testBed.resolve(PendingSelectionRepository)
	})

	beforeEach(async () => {
		await testBed.reset()
	})

	afterAll(async () => {
		await testBed.destroy()
	})

	it('round-trips a selection per quota key and clears it', async () => {
		await repo.save(OWNER, { [QuotaKey.EXAMPLE_KEY]: ['u1', 'u2'] })
		expect(await repo.findByOwner(OWNER)).toEqual({ [QuotaKey.EXAMPLE_KEY]: ['u1', 'u2'] })
		await repo.clear(OWNER)
		expect(await repo.findByOwner(OWNER)).toEqual({})
	})

	it('drops a quota key whose id array is empty instead of storing an empty row', async () => {
		await repo.save(OWNER, { [QuotaKey.EXAMPLE_KEY]: [] })
		expect(await repo.findByOwner(OWNER)).toEqual({})
	})

	it('replaces the prior selection on re-save instead of appending to it', async () => {
		await repo.save(OWNER, { [QuotaKey.EXAMPLE_KEY]: ['u1', 'u2'] })
		await repo.save(OWNER, { [QuotaKey.EXAMPLE_KEY]: ['u3'] })
		expect(await repo.findByOwner(OWNER)).toEqual({ [QuotaKey.EXAMPLE_KEY]: ['u3'] })
	})
})
