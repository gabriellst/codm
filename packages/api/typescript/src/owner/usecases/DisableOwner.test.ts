import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, testId, givenOwner } from '@test/support'
import { DomainEventRepository } from '@codm/core-typescript'
import { DisableOwner } from './DisableOwner'
import { OwnerRepository } from '../repositories/OwnerRepository'
import { OwnerDisabledEvent } from '../events/OwnerDisabledEvent'

const ACTOR_ID = testId('user', '1')
const ABSENT_OWNER_ID = testId('owner', 'absent')

describe('DisableOwner use case (C19)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let disable: DisableOwner
	let ownerRepo: OwnerRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant', db: 'pg' })
		disable = testBed.resolve(DisableOwner)
		ownerRepo = testBed.resolve(OwnerRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	// State via the shared repo-direct given — never a local seed helper.
	const seedActiveOwner = async (): Promise<string> => (await givenOwner(testBed, { name: 'Acme', timezone: 'UTC' })).id.value

	async function readDisabledEvents() {
		return testBed.resolve(DomainEventRepository).findByType(OwnerDisabledEvent)
	}

	it('disables an active owner + emits OwnerDisabled with ISO disabledAt + reason', async () => {
		const ownerId = await seedActiveOwner()
		const out = await disable.execute({
			ownerId,
			disabledByUserId: ACTOR_ID,
			reason: 'fraud suspected',
		})
		expect(out).toEqual({ ownerId, isDisabled: true })

		const reloaded = await ownerRepo.findById(ownerId)
		expect(reloaded?.isDisabled).toBe(true)
		expect(reloaded?.disabledReason).toBe('fraud suspected')

		const evs = await readDisabledEvents()
		expect(evs).toHaveLength(1)
		expect(evs[0]!.payload.ownerId).toBe(ownerId)
		expect(evs[0]!.payload.disabledReason).toBe('fraud suspected')
		// disabledAt is ISO-with-offset (Zod refinement enforced).
		expect(typeof evs[0]!.payload.disabledAt).toBe('string')
		expect(() => new Date(evs[0]!.payload.disabledAt).toISOString()).not.toThrow()
	})

	it('disables without a reason — reason is optional', async () => {
		const ownerId = await seedActiveOwner()
		const out = await disable.execute({ ownerId, disabledByUserId: ACTOR_ID })
		expect(out.isDisabled).toBe(true)

		const reloaded = await ownerRepo.findById(ownerId)
		expect(reloaded?.isDisabled).toBe(true)
		expect(reloaded?.disabledReason).toBeUndefined()

		const evs = await readDisabledEvents()
		expect(evs[0]!.payload.disabledReason).toBeUndefined()
	})

	it('throws OWNER_ALREADY_DISABLED when called twice', async () => {
		const ownerId = await seedActiveOwner()
		await disable.execute({ ownerId, disabledByUserId: ACTOR_ID, reason: 'first' })

		await expect(disable.execute({ ownerId, disabledByUserId: ACTOR_ID, reason: 'second' })).rejects.toMatchObject({
			name: 'OWNER_ALREADY_DISABLED',
		})

		// Only one event from the first call.
		expect(await readDisabledEvents()).toHaveLength(1)
		// Original reason preserved.
		const reloaded = await ownerRepo.findById(ownerId)
		expect(reloaded?.disabledReason).toBe('first')
	})

	it('throws OWNER_NOT_FOUND when the owner does not exist', async () => {
		await expect(disable.execute({ ownerId: ABSENT_OWNER_ID, disabledByUserId: ACTOR_ID })).rejects.toMatchObject({
			name: 'OWNER_NOT_FOUND',
		})
		expect(await readDisabledEvents()).toHaveLength(0)
	})
})
