import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenUser } from '@test/support'
import { LanguageTag, Timezone } from '@shared/objects'
import { UserProfile } from '../../entities/UserProfile'
import { UserProfileRepository } from './UserProfileRepository'

describe('DrizzleUserProfileRepository (integration)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let repo: UserProfileRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
		repo = testBed.resolve(UserProfileRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('save + findByUserId round-trips timezone + language as value objects', async () => {
		const user = await givenUser(testBed, { email: 'p@b.com' })
		const userId = user.id.value
		const profile = UserProfile.create({
			userId,
			timezone: 'America/Sao_Paulo',
			language: 'pt-BR',
		})
		await repo.save(profile)

		const found = await repo.findByUserId(userId)
		expect(found).toBeDefined()
		expect(found?.userId.value).toBe(userId)
		expect(found?.timezone).toBeInstanceOf(Timezone)
		expect(found?.timezone?.toString()).toBe('America/Sao_Paulo')
		expect(found?.language).toBeInstanceOf(LanguageTag)
		expect(found?.language?.toString()).toBe('pt-BR')
	})

	it('findByUserId returns undefined for unknown id', async () => {
		const found = await repo.findByUserId('non-existent-user')
		expect(found).toBeUndefined()
	})

	it('save increments version on each save', async () => {
		const user = await givenUser(testBed, { email: 'ver@b.com' })
		const userId = user.id.value
		const profile = UserProfile.create({ userId, timezone: 'UTC' })
		await repo.save(profile)
		const v1 = profile.version

		profile.updateProfile({ timezone: 'America/Sao_Paulo' })
		await repo.save(profile)

		const reloaded = await repo.findByUserId(userId)
		expect(reloaded?.version).toBeGreaterThan(v1)
		expect(reloaded?.timezone?.toString()).toBe('America/Sao_Paulo')
	})

	it('delete removes the row', async () => {
		const user = await givenUser(testBed, { email: 'del@b.com' })
		const userId = user.id.value
		const profile = UserProfile.create({ userId })
		await repo.save(profile)

		await repo.delete(userId)
		const found = await repo.findByUserId(userId)
		expect(found).toBeUndefined()
	})
})
