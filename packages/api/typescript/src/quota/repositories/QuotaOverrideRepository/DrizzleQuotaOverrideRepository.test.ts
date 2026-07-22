import { TestBed } from '@test/support'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { UnitOfWorkFactory } from '@template/core-typescript'

import { QuotaOverride } from '@quota/entities'
import { QuotaOverrideRepository } from '@quota/repositories'
import { QuotaKey } from '@template/contracts-typescript/wire/enums'

// Integration test for the DrizzleQuotaOverrideRepository (bound in the integration profile). Proves
// the three properties QuotaEntitlement + ApplyQuotaOverride rely on: SUM read-back, idempotency on
// idemKey, and tx-consistency (a write is visible to a read on the same transaction).
describe('DrizzleQuotaOverrideRepository', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let repository: QuotaOverrideRepository

	const OWNER = 'o1'

	const grant = (delta: number, idemKey: string, ownerId = OWNER) =>
		QuotaOverride.create({ ownerId, meter: QuotaKey.EXAMPLE_KEY, delta, idemKey })

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OWNER })
		repository = testBed.resolve(QuotaOverrideRepository)
	})

	beforeEach(async () => {
		await testBed.reset()
	})

	afterAll(async () => {
		await testBed.destroy()
	})

	it('currentDelta is 0 when no override exists', async () => {
		expect(await repository.currentDelta(OWNER, QuotaKey.EXAMPLE_KEY)).toBe(0)
	})

	it('applyIfNew persists a delta that currentDelta reads back', async () => {
		await repository.applyIfNew(grant(750, 'k1'))
		expect(await repository.currentDelta(OWNER, QuotaKey.EXAMPLE_KEY)).toBe(750)
	})

	it('sums multiple distinct grants (including a negative delta)', async () => {
		await repository.applyIfNew(grant(1000, 'k1'))
		await repository.applyIfNew(grant(500, 'k2'))
		await repository.applyIfNew(grant(-200, 'k3'))
		expect(await repository.currentDelta(OWNER, QuotaKey.EXAMPLE_KEY)).toBe(1300)
	})

	it('is idempotent on idemKey — a replayed applyIfNew is a no-op', async () => {
		await repository.applyIfNew(grant(300, 'dup'))
		await repository.applyIfNew(grant(300, 'dup'))
		expect(await repository.currentDelta(OWNER, QuotaKey.EXAMPLE_KEY)).toBe(300)
	})

	it('scopes the sum per owner', async () => {
		await repository.applyIfNew(grant(400, 'k-owner'))
		await repository.applyIfNew(grant(999, 'k-other', 'other'))
		expect(await repository.currentDelta(OWNER, QuotaKey.EXAMPLE_KEY)).toBe(400)
	})

	it('currentDeltaMany returns every requested owner (0 when none)', async () => {
		await repository.applyIfNew(grant(400, 'k-owner'))
		const result = await repository.currentDeltaMany([OWNER, 'never-granted'], QuotaKey.EXAMPLE_KEY)
		expect(result.get(OWNER)).toBe(400)
		expect(result.get('never-granted')).toBe(0)
	})

	it('a write is visible to a read threaded on the same transaction', async () => {
		const uow = testBed.resolve(UnitOfWorkFactory).create()
		const seen = await uow.transaction(async tx => {
			await repository.applyIfNew(grant(42, 'k-tx'), tx)
			return repository.currentDelta(OWNER, QuotaKey.EXAMPLE_KEY, tx)
		})
		expect(seen).toBe(42)
		// And it committed with the transaction.
		expect(await repository.currentDelta(OWNER, QuotaKey.EXAMPLE_KEY)).toBe(42)
	})
})
