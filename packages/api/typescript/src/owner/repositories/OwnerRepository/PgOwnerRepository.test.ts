import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, testId } from '@test/support'
import { OwnerKind } from '@codm/contracts-typescript/wire/enums'
import { Owner } from '../../entities/Owner'
import { OwnerRepository } from './OwnerRepository'

const base = { kind: OwnerKind.ORGANIZATION, responsibleUserId: '019e4d24-6524-7041-9e1c-8108180cddae' }

describe('PgOwnerRepository (integration)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let repo: OwnerRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant', db: 'pg' })
		repo = testBed.resolve(OwnerRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('save + findById round-trips all persisted fields', async () => {
		const owner = Owner.create({
			...base,
			name: 'Acme',
			timezone: 'America/Sao_Paulo',
			pictureUrl: 'https://cdn.test/logo.png',
		})
		await repo.save(owner)

		const found = await repo.findById(owner.id.value)
		expect(found).toBeDefined()
		expect(found?.name).toBe('Acme')
		expect(found?.kind).toBe(OwnerKind.ORGANIZATION)
		expect(found?.responsibleUserId).toBe(base.responsibleUserId)
		expect(found?.timezone).toBe('America/Sao_Paulo')
		expect(found?.pictureUrl).toBe('https://cdn.test/logo.png')
		expect(found?.isDisabled).toBe(false)
		expect(found?.disabledReason).toBeUndefined()
	})

	it('findById returns undefined for unknown id', async () => {
		const found = await repo.findById(testId())
		expect(found).toBeUndefined()
	})

	it('findByOwnerId returns the owner (or null for unknown id)', async () => {
		const owner = Owner.create({ ...base, name: 'Acme', timezone: 'UTC' })
		await repo.save(owner)
		expect((await repo.findByOwnerId(owner.id.value))?.name).toBe('Acme')
		expect(await repo.findByOwnerId(testId())).toBeNull()
	})

	it('save UPSERTs (re-save mutates row + bumps version)', async () => {
		const owner = Owner.create({ ...base, name: 'Acme', timezone: 'UTC' })
		await repo.save(owner)
		const v1 = owner.version

		owner.updateSettings({ name: 'Acme Co' })
		await repo.save(owner)

		const reloaded = await repo.findById(owner.id.value)
		expect(reloaded?.name).toBe('Acme Co')
		expect(reloaded?.version).toBeGreaterThan(v1)
	})

	it('disable() round-trips through the DB', async () => {
		const owner = Owner.create({ ...base, name: 'Acme', timezone: 'UTC' })
		owner.disable('manual')
		await repo.save(owner)

		const reloaded = await repo.findById(owner.id.value)
		expect(reloaded?.isDisabled).toBe(true)
		expect(reloaded?.disabledReason).toBe('manual')
	})

	it('delete removes the row', async () => {
		const owner = Owner.create({ ...base, name: 'Acme', timezone: 'UTC' })
		await repo.save(owner)

		await repo.delete(owner.id.value)
		expect(await repo.findById(owner.id.value)).toBeUndefined()
	})
})
