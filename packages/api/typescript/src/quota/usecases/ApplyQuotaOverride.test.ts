import { TestBed, testId } from '@test/support'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { ApplyQuotaOverride } from './ApplyQuotaOverride'
import { QuotaOverrideRepository } from '@quota/repositories'

import { QuotaOverrideAppliedEvent } from '@quota/events'
import { QuotaKey } from '@template/contracts-typescript/wire/enums'

// The audit event's `entityId` is the ownerId, and shared.events.entity_id is a UUID column — so
// owner ids in these fixtures are real UUIDs (via testId), as they are in the running system.
const NO_SUB_OWNER = testId('quota-apply-no-sub')

describe('ApplyQuotaOverride', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let usecase: ApplyQuotaOverride
	let overrideRepository: QuotaOverrideRepository

	const OWNER = testId('quota-apply-owner')

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OWNER })
		usecase = testBed.resolve(ApplyQuotaOverride)
		overrideRepository = testBed.resolve(QuotaOverrideRepository)
	})

	beforeEach(async () => {
		await testBed.reset()
	})

	afterAll(async () => {
		await testBed.destroy()
	})

	it('writes the override to the native store (raising the effective delta)', async () => {
		await usecase.execute({ ownerId: OWNER, meter: QuotaKey.EXAMPLE_KEY, delta: 1000, idempotencyKey: 'key-1' })

		expect(await overrideRepository.currentDelta(OWNER, QuotaKey.EXAMPLE_KEY)).toBe(1000)
	})

	it('applies the override even when the owner has no subscription (not a subscription invariant)', async () => {
		await usecase.execute({ ownerId: NO_SUB_OWNER, meter: QuotaKey.EXAMPLE_KEY, delta: 100, idempotencyKey: 'key-2' })

		expect(await overrideRepository.currentDelta(NO_SUB_OWNER, QuotaKey.EXAMPLE_KEY)).toBe(100)
	})

	it('is idempotent: two calls with the same idempotencyKey apply the override only once', async () => {
		const input = { ownerId: OWNER, meter: QuotaKey.EXAMPLE_KEY, delta: 1000, idempotencyKey: 'same-key' } as const

		await usecase.execute(input)
		await usecase.execute(input)

		expect(await overrideRepository.currentDelta(OWNER, QuotaKey.EXAMPLE_KEY)).toBe(1000)
	})

	it('accumulates when called with two different idempotencyKeys', async () => {
		await usecase.execute({ ownerId: OWNER, meter: QuotaKey.EXAMPLE_KEY, delta: 1000, idempotencyKey: 'key-a' })
		await usecase.execute({ ownerId: OWNER, meter: QuotaKey.EXAMPLE_KEY, delta: 500, idempotencyKey: 'key-b' })

		expect(await overrideRepository.currentDelta(OWNER, QuotaKey.EXAMPLE_KEY)).toBe(1500)
	})

	it('saves a QuotaOverrideAppliedEvent audit row', async () => {
		await usecase.execute({ ownerId: OWNER, meter: QuotaKey.EXAMPLE_KEY, delta: 250, idempotencyKey: 'key-audit' })

		const rows = await testBed.probe().persistedEvents({ name: QuotaOverrideAppliedEvent.name })

		expect(rows).toHaveLength(1)
		expect(rows[0]!.entityId).toBe(OWNER)
		expect(rows[0]!.ownerId).toBe(OWNER)
		expect(rows[0]!.payload).toEqual({ ownerId: OWNER, meter: QuotaKey.EXAMPLE_KEY, delta: 250, idempotencyKey: 'key-audit' })
	})

	it('does not save a second audit event when the idempotencyKey is replayed', async () => {
		const input = { ownerId: OWNER, meter: QuotaKey.EXAMPLE_KEY, delta: 1000, idempotencyKey: 'replayed-key' } as const

		await usecase.execute(input)
		await usecase.execute(input)

		const rows = await testBed.probe().persistedEvents({ name: QuotaOverrideAppliedEvent.name })
		expect(rows).toHaveLength(1)
	})
})
