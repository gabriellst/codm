import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { BaseError, DomainEventRepository } from '@codm/core-typescript'
import { OwnerKind } from '@codm/contracts-typescript/wire/enums'
import { CreateOwner } from './CreateOwner'
import { OwnerRepository } from '../repositories/OwnerRepository'
import { OwnerCreatedEvent } from '../events'

describe('CreateOwner use case', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	const userId = '019e4d24-6524-7041-9e1c-8108180cddae'

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('happy path: creates Owner (creator = responsible user) + emits created event', async () => {
		const useCase = testBed.resolve(CreateOwner)
		const ownerRepo = testBed.resolve(OwnerRepository)

		const out = await useCase.execute({
			userId,
			name: 'Acme',
			kind: OwnerKind.ORGANIZATION,
			timezone: 'America/Sao_Paulo',
		})

		expect(out.ownerId).toBeDefined()

		const owner = await ownerRepo.findById(out.ownerId)
		expect(owner?.name).toBe('Acme')
		expect(owner?.kind).toBe(OwnerKind.ORGANIZATION)
		expect(owner?.responsibleUserId).toBe(userId)

		const eventRepo = testBed.resolve(DomainEventRepository)
		const created = await eventRepo.findByType(OwnerCreatedEvent)
		expect(created).toHaveLength(1)
		expect(created[0]!.payload.ownerId).toBe(out.ownerId)
	})

	it('defaults kind to ORGANIZATION when omitted', async () => {
		const useCase = testBed.resolve(CreateOwner)
		const ownerRepo = testBed.resolve(OwnerRepository)
		const { ownerId } = await useCase.execute({ userId, name: 'NoKind' } as never)
		const owner = await ownerRepo.findById(ownerId)
		expect(owner?.kind).toBe(OwnerKind.ORGANIZATION)
	})

	it('allows a user to be responsible for multiple owners (no quota gate)', async () => {
		const useCase = testBed.resolve(CreateOwner)
		const ownerRepo = testBed.resolve(OwnerRepository)

		await useCase.execute({ userId, name: 'A', kind: OwnerKind.ORGANIZATION, timezone: 'UTC' })
		await useCase.execute({ userId, name: 'B', kind: OwnerKind.ORGANIZATION, timezone: 'UTC' })
		await useCase.execute({ userId, name: 'C', kind: OwnerKind.ORGANIZATION, timezone: 'UTC' })

		const owners = await ownerRepo.findByResponsibleUserId(userId)
		expect(owners).toHaveLength(3)
	})

	it('rejects invalid timezone (entity invariant propagates)', async () => {
		const useCase = testBed.resolve(CreateOwner)
		await expect(useCase.execute({ userId, name: 'X', kind: OwnerKind.ORGANIZATION, timezone: 'not-valid' })).rejects.toThrow(BaseError)
	})

	it('rejects empty name (entity invariant propagates)', async () => {
		const useCase = testBed.resolve(CreateOwner)
		await expect(useCase.execute({ userId, name: '   ', kind: OwnerKind.ORGANIZATION, timezone: 'UTC' })).rejects.toThrow(BaseError)
	})
})
