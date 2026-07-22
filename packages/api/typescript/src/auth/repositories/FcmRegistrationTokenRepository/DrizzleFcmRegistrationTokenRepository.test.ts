import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenUser } from '@test/support'
import { FcmRegistrationToken } from '../../entities/FcmRegistrationToken'
import { FcmRegistrationTokenRepository } from './FcmRegistrationTokenRepository'
import { FcmPlatform } from '@template/contracts-typescript/wire/enums'

describe('DrizzleFcmRegistrationTokenRepository (integration)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let repo: FcmRegistrationTokenRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
		repo = testBed.resolve(FcmRegistrationTokenRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('save + findByToken round-trips the row', async () => {
		const userId = (await givenUser(testBed, { email: 'tok@b.com' })).id.value
		const t = FcmRegistrationToken.create({ userId, token: 'tk1', platform: FcmPlatform.IOS })
		await repo.save(t)

		const found = await repo.findByToken('tk1')
		expect(found?.userId.value).toBe(userId)
		expect(found?.token).toBe('tk1')
		expect(found?.platform).toBe(FcmPlatform.IOS)
		expect(found?.lastSeenAt).toBeInstanceOf(Date)
	})

	it('findByToken returns undefined for unknown token', async () => {
		const found = await repo.findByToken('no-such-token')
		expect(found).toBeUndefined()
	})

	it('listByUserId returns all tokens for the user', async () => {
		const userId = (await givenUser(testBed, { email: 'list@b.com' })).id.value
		await repo.save(FcmRegistrationToken.create({ userId, token: 'tk1', platform: FcmPlatform.IOS }))
		await repo.save(FcmRegistrationToken.create({ userId, token: 'tk2', platform: FcmPlatform.ANDROID }))
		await repo.save(FcmRegistrationToken.create({ userId, token: 'tk3', platform: FcmPlatform.WEB }))

		const list = await repo.listByUserId(userId)
		expect(list.map(t => t.token).sort()).toEqual(['tk1', 'tk2', 'tk3'])
	})

	it('listByUserId scopes results to the requested user only', async () => {
		const userA = (await givenUser(testBed, { email: 'a@b.com' })).id.value
		const userB = (await givenUser(testBed, { email: 'b@b.com' })).id.value
		await repo.save(FcmRegistrationToken.create({ userId: userA, token: 'tk-a', platform: FcmPlatform.IOS }))
		await repo.save(FcmRegistrationToken.create({ userId: userB, token: 'tk-b', platform: FcmPlatform.IOS }))

		const listA = await repo.listByUserId(userA)
		expect(listA.map(t => t.token)).toEqual(['tk-a'])
		const listB = await repo.listByUserId(userB)
		expect(listB.map(t => t.token)).toEqual(['tk-b'])
	})

	it('listByUserId returns [] for a user with no registered tokens', async () => {
		const userId = (await givenUser(testBed, { email: 'empty@b.com' })).id.value
		const list = await repo.listByUserId(userId)
		expect(list).toEqual([])
	})

	it('touch() persists the new lastSeenAt on save', async () => {
		const userId = (await givenUser(testBed, { email: 'touch@b.com' })).id.value
		const t = FcmRegistrationToken.create({ userId, token: 'tk-touch', platform: FcmPlatform.IOS })
		await repo.save(t)
		const before = (await repo.findByToken('tk-touch'))!.lastSeenAt.getTime()

		await new Promise(r => setTimeout(r, 5))
		t.touch()
		await repo.save(t)
		const after = (await repo.findByToken('tk-touch'))!.lastSeenAt.getTime()

		expect(after).toBeGreaterThan(before)
	})

	it('delete removes the row', async () => {
		const userId = (await givenUser(testBed, { email: 'del@b.com' })).id.value
		const t = FcmRegistrationToken.create({ userId, token: 'tk-del', platform: FcmPlatform.WEB })
		await repo.save(t)

		await repo.delete(t.id.value)
		const found = await repo.findByToken('tk-del')
		expect(found).toBeUndefined()
	})
})
