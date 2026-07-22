import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, testId, givenOwner } from '@test/support'
import { DomainEventRepository } from '@codedm/core-typescript'
import { DisableOwner } from './DisableOwner'
import { EnableOwner } from './EnableOwner'
import { OwnerRepository } from '../repositories/OwnerRepository'
import { OwnerEnabledEvent } from '../events'

const ACTOR_ID = testId('user', '1')
const ABSENT_OWNER_ID = testId('owner', 'absent')

describe('EnableOwner use case (C20)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let enable: EnableOwner
	let disable: DisableOwner
	let ownerRepo: OwnerRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
		enable = testBed.resolve(EnableOwner)
		disable = testBed.resolve(DisableOwner)
		ownerRepo = testBed.resolve(OwnerRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	async function readEnabledEvents() {
		return testBed.resolve(DomainEventRepository).findByType(OwnerEnabledEvent)
	}

	it('enables a disabled owner + emits OwnerEnabled with ISO enabledAt', async () => {
		const ownerId = (await givenOwner(testBed)).id.value
		await disable.execute({ ownerId, disabledByUserId: ACTOR_ID, reason: 'maintenance' })

		const out = await enable.execute({ ownerId, enabledByUserId: ACTOR_ID })
		expect(out).toEqual({ ownerId, isDisabled: false })

		const reloaded = await ownerRepo.findById(ownerId)
		expect(reloaded?.isDisabled).toBe(false)
		expect(reloaded?.disabledReason).toBeUndefined()

		const evs = await readEnabledEvents()
		expect(evs).toHaveLength(1)
		expect(evs[0]!.payload.ownerId).toBe(ownerId)
		expect(typeof evs[0]!.payload.enabledAt).toBe('string')
		expect(() => new Date(evs[0]!.payload.enabledAt).toISOString()).not.toThrow()
	})

	it('throws OWNER_NOT_DISABLED when the owner is already active', async () => {
		const ownerId = (await givenOwner(testBed)).id.value

		await expect(enable.execute({ ownerId, enabledByUserId: ACTOR_ID })).rejects.toMatchObject({ name: 'OWNER_NOT_DISABLED' })
		expect(await readEnabledEvents()).toHaveLength(0)
	})

	it('throws OWNER_NOT_FOUND when the owner does not exist', async () => {
		await expect(enable.execute({ ownerId: ABSENT_OWNER_ID, enabledByUserId: ACTOR_ID })).rejects.toMatchObject({ name: 'OWNER_NOT_FOUND' })
		expect(await readEnabledEvents()).toHaveLength(0)
	})

	it('disable → enable → disable cycle works (no sticky state)', async () => {
		const ownerId = (await givenOwner(testBed)).id.value
		await disable.execute({ ownerId, disabledByUserId: ACTOR_ID, reason: 'first' })
		await enable.execute({ ownerId, enabledByUserId: ACTOR_ID })
		await disable.execute({ ownerId, disabledByUserId: ACTOR_ID, reason: 'second' })

		const reloaded = await ownerRepo.findById(ownerId)
		expect(reloaded?.isDisabled).toBe(true)
		expect(reloaded?.disabledReason).toBe('second')
		// One enable event from the middle step.
		expect(await readEnabledEvents()).toHaveLength(1)
	})
})
