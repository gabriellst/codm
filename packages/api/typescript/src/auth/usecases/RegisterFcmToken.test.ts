import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenUser } from '@test/support'
import { DomainEventRepository } from '@template/core-typescript'
import { RegisterFcmToken } from './RegisterFcmToken'
import { FcmRegistrationTokenRepository } from '../repositories/FcmRegistrationTokenRepository'
import { FcmTokenRegisteredEvent } from '../events'
import { FcmPlatform } from '@template/contracts-typescript/wire/enums'

describe('RegisterFcmToken use case (C09)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let useCase: RegisterFcmToken
	let fcmRepo: FcmRegistrationTokenRepository
	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
		useCase = testBed.resolve(RegisterFcmToken)
		fcmRepo = testBed.resolve(FcmRegistrationTokenRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	async function readRegisteredEvents() {
		return testBed.resolve(DomainEventRepository).findByType(FcmTokenRegisteredEvent)
	}

	it('registers a new token + emits FcmTokenRegistered event', async () => {
		const userId = (await givenUser(testBed, { email: 'reg@b.com' })).id.value
		await useCase.execute({ userId, token: 'tk1', platform: FcmPlatform.IOS })

		const found = await fcmRepo.findByToken('tk1')
		expect(found?.userId.value).toBe(userId)
		expect(found?.platform).toBe(FcmPlatform.IOS)

		const evts = await readRegisteredEvents()
		expect(evts).toHaveLength(1)
		expect(evts[0]!.payload.userId).toBe(userId)
		expect(evts[0]!.payload.tokenId).toBe(found!.id.value)
		expect(evts[0]!.payload.platform).toBe(FcmPlatform.IOS)
	})

	it('idempotent on duplicate token: touches lastSeenAt, no second event', async () => {
		const userId = (await givenUser(testBed, { email: 'dup@b.com' })).id.value
		await useCase.execute({ userId, token: 'tk1', platform: FcmPlatform.IOS })
		const before = (await fcmRepo.findByToken('tk1'))!.lastSeenAt.getTime()

		await new Promise(r => setTimeout(r, 5))
		await useCase.execute({ userId, token: 'tk1', platform: FcmPlatform.IOS })
		const after = (await fcmRepo.findByToken('tk1'))!.lastSeenAt.getTime()

		expect(after).toBeGreaterThan(before)
		const evts = await readRegisteredEvents()
		expect(evts).toHaveLength(1)
	})

	it('multiple distinct tokens for the same user → multiple events', async () => {
		const userId = (await givenUser(testBed, { email: 'multi@b.com' })).id.value
		await useCase.execute({ userId, token: 'tk1', platform: FcmPlatform.IOS })
		await useCase.execute({ userId, token: 'tk2', platform: FcmPlatform.ANDROID })
		await useCase.execute({ userId, token: 'tk3', platform: FcmPlatform.WEB })

		const list = await fcmRepo.listByUserId(userId)
		expect(list.map(t => t.token).sort()).toEqual(['tk1', 'tk2', 'tk3'])

		const evts = await readRegisteredEvents()
		expect(evts).toHaveLength(3)
	})

	it('rejects empty token via Zod min(1)', async () => {
		const userId = (await givenUser(testBed, { email: 'empty@b.com' })).id.value
		await expect(useCase.execute({ userId, token: '', platform: FcmPlatform.IOS })).rejects.toThrow()
	})
})
