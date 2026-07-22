import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { Language } from '@template/contracts-typescript/wire/enums'
import { BillingProfile } from '../../entities'
import { BillingProfileRepository } from './index'

describe('DrizzleBillingProfileRepository', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let repo: BillingProfileRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
		repo = testBed.resolve(BillingProfileRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const profile = () =>
		BillingProfile.create({ ownerId: 'own-1', name: 'Acme Co', email: 'fin@acme.com', document: '11144477735', language: Language.EN_US })

	it('insertIfNew + findByOwnerId round-trips, including the billing language', async () => {
		await repo.insertIfNew(profile())
		const found = await repo.findByOwnerId('own-1')
		expect(found?.name).toBe('Acme Co')
		expect(found?.language).toBe(Language.EN_US)
	})

	it('insertIfNew is write-once — a replay never clobbers a later edit', async () => {
		await repo.insertIfNew(profile())
		const edited = await repo.findByOwnerId('own-1')
		edited!.setLanguage(Language.PT_BR)
		await repo.save(edited!)
		await repo.insertIfNew(profile()) // replay with EN
		expect((await repo.findByOwnerId('own-1'))?.language).toBe(Language.PT_BR)
	})

	it('save persists updated identity fields', async () => {
		await repo.insertIfNew(profile())
		const p = await repo.findByOwnerId('own-1')
		p!.updateIdentity({ email: 'new@acme.com' })
		await repo.save(p!)
		expect((await repo.findByOwnerId('own-1'))?.email).toBe('new@acme.com')
	})
})
