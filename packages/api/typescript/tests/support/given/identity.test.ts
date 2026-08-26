import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { UserProfileRepository } from '@auth/repositories/UserProfileRepository'
import { TestBed } from '../TestBed'
import { givenUserProfile } from './identity'

describe('identity given-helpers', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant', db: 'pg' })
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
})
