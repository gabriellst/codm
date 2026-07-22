import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { FcmPlatform } from '@template/contracts-typescript/wire/enums'
import { UserProfileRepository } from '@auth/repositories/UserProfileRepository'
import { FcmRegistrationTokenRepository } from '@auth/repositories/FcmRegistrationTokenRepository'
import { TestBed } from '../TestBed'
import { givenUserProfile, givenFcmRegistrationToken } from './identity'

describe('identity given-helpers', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('givenUserProfile creates a user + profile retrievable by id', async () => {
		const profile = await givenUserProfile(testBed)
		const found = await testBed.resolve(UserProfileRepository).findByUserId(profile.userId.value)
		expect(found?.userId.value).toBe(profile.userId.value)
	})


	it('givenFcmRegistrationToken persists a token for a user', async () => {
		const { token } = await givenFcmRegistrationToken(testBed, { platform: FcmPlatform.IOS })
		const found = await testBed.resolve(FcmRegistrationTokenRepository).findByToken(token.token)
		expect(found?.platform).toBe(FcmPlatform.IOS)
	})
})
