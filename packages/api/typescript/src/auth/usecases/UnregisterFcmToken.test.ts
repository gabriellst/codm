import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenUser } from '@test/support'
import { DomainEventRepository } from '@template/core-typescript'
import { RegisterFcmToken } from './RegisterFcmToken'
import { UnregisterFcmToken } from './UnregisterFcmToken'
import { FcmRegistrationTokenRepository } from '../repositories/FcmRegistrationTokenRepository'
import { FcmTokenUnregisteredEvent } from '../events'
import { FcmPlatform } from '@template/contracts-typescript/wire/enums'

describe('UnregisterFcmToken use case (C10)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let register: RegisterFcmToken
	let unregister: UnregisterFcmToken
	let fcmRepo: FcmRegistrationTokenRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
		register = testBed.resolve(RegisterFcmToken)
		unregister = testBed.resolve(UnregisterFcmToken)
		fcmRepo = testBed.resolve(FcmRegistrationTokenRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	async function readUnregisteredEvents() {
		return testBed.resolve(DomainEventRepository).findByType(FcmTokenUnregisteredEvent)
	}

	it('removes the token + emits FcmTokenUnregistered event', async () => {
		const user = await givenUser(testBed, { email: 'unreg@b.com' })
		const userId = user.id.value
		await register.execute({ userId, token: 'tk1', platform: FcmPlatform.IOS })
		const before = await fcmRepo.findByToken('tk1')
		expect(before).toBeDefined()

		await unregister.execute({ userId, token: 'tk1' })

		expect(await fcmRepo.findByToken('tk1')).toBeUndefined()
		const evts = await readUnregisteredEvents()
		expect(evts).toHaveLength(1)
		expect(evts[0]!.payload.userId).toBe(userId)
		expect(evts[0]!.payload.tokenId).toBe(before!.id.value)
	})

	it('no-op if token absent — no event, no error', async () => {
		const user = await givenUser(testBed, { email: 'absent@b.com' })
		const userId = user.id.value
		await unregister.execute({ userId, token: 'never-registered' })

		const evts = await readUnregisteredEvents()
		expect(evts).toHaveLength(0)
	})

	it('no-op if token belongs to another user (defense-in-depth)', async () => {
		const userA = (await givenUser(testBed, { email: 'a@b.com' })).id.value
		const userB = (await givenUser(testBed, { email: 'b@b.com' })).id.value
		await register.execute({ userId: userA, token: 'tk-a', platform: FcmPlatform.IOS })

		await unregister.execute({ userId: userB, token: 'tk-a' })

		expect(await fcmRepo.findByToken('tk-a')).toBeDefined()
		const evts = await readUnregisteredEvents()
		expect(evts).toHaveLength(0)
	})
})
