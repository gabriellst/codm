import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, testId, givenOwner } from '@test/support'
import { DomainEventRepository } from '@codedm/core-typescript'
import { UpdateOwnerSettings } from './UpdateOwnerSettings'
import { OwnerRepository } from '../repositories/OwnerRepository'
import { OwnerSettingsUpdatedEvent } from '../events'

describe('UpdateOwnerSettings use case', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let useCase: UpdateOwnerSettings
	let ownerRepo: OwnerRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
		useCase = testBed.resolve(UpdateOwnerSettings)
		ownerRepo = testBed.resolve(OwnerRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	async function readEvents() {
		return testBed.resolve(DomainEventRepository).findByType(OwnerSettingsUpdatedEvent)
	}

	it('partial profile update emits OwnerSettingsUpdated', async () => {
		const owner = await givenOwner(testBed, { name: 'Acme', timezone: 'UTC' })
		const ownerId = owner.id.value
		await useCase.execute({ ownerId, name: 'Acme Co', pictureUrl: 'https://cdn.test/logo.png' })

		const reloaded = await ownerRepo.findById(ownerId)
		expect(reloaded?.name).toBe('Acme Co')
		expect(reloaded?.pictureUrl).toBe('https://cdn.test/logo.png')

		const evts = await readEvents()
		expect(evts).toHaveLength(1)
		expect(evts[0]!.payload.owner.name).toBe('Acme Co')
	})

	it('empty input → emits OwnerSettingsUpdatedEvent (always-publish)', async () => {
		const { id } = await givenOwner(testBed, { name: 'Acme', timezone: 'UTC' })
		await useCase.execute({ ownerId: id.value })

		const evts = await readEvents()
		expect(evts).toHaveLength(1)
	})

	it('same value → emits OwnerSettingsUpdatedEvent (idempotent re-publish)', async () => {
		const { id } = await givenOwner(testBed, { name: 'Acme', timezone: 'UTC' })
		await useCase.execute({ ownerId: id.value, name: 'Acme' })

		const evts = await readEvents()
		expect(evts).toHaveLength(1)
		expect(evts[0]!.payload.owner.name).toBe('Acme')
	})

	it('throws OWNER_NOT_FOUND for unknown ownerId', async () => {
		await expect(useCase.execute({ ownerId: testId('owner', '0'), name: 'X' })).rejects.toMatchObject({
			name: 'OWNER_NOT_FOUND',
		})
	})

	it('timezone-only change is persisted + published', async () => {
		const owner = await givenOwner(testBed, { name: 'Acme', timezone: 'UTC' })
		const ownerId = owner.id.value

		await useCase.execute({ ownerId, timezone: 'America/Sao_Paulo' })

		const reloaded = await ownerRepo.findById(ownerId)
		expect(reloaded?.timezone).toBe('America/Sao_Paulo')
		const evts = await readEvents()
		expect(evts[0]!.payload.owner.timezone).toBe('America/Sao_Paulo')
	})

	it('combined name + picture + timezone update in one call', async () => {
		const owner = await givenOwner(testBed, { name: 'Acme', timezone: 'UTC' })
		const ownerId = owner.id.value

		await useCase.execute({ ownerId, name: 'Acme Co', pictureUrl: 'https://cdn.test/l.png', timezone: 'America/Sao_Paulo' })

		const reloaded = await ownerRepo.findById(ownerId)
		expect(reloaded?.name).toBe('Acme Co')
		expect(reloaded?.pictureUrl).toBe('https://cdn.test/l.png')
		expect(reloaded?.timezone).toBe('America/Sao_Paulo')
		expect(await readEvents()).toHaveLength(1)
	})
})
