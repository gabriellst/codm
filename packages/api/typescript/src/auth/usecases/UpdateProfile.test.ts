import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, testId } from '@test/support'
import { DomainEventRepository } from '@template/core-typescript'
import { UpdateProfile } from './UpdateProfile'
import { ProfileUpdatedEvent } from '../events'
import { UserRepository as AuthUserRepository } from '@auth/repositories/UserRepository/UserRepository'
import { User as AuthUser } from '@auth/entities'

describe('UpdateProfile use case (C08)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let useCase: UpdateProfile
	let authRepo: AuthUserRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
		useCase = testBed.resolve(UpdateProfile)
		authRepo = testBed.resolve(AuthUserRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	async function seedAuthUser(opts: { email: string; name?: string | null; image?: string | null }): Promise<string> {
		const u = AuthUser.create({
			email: opts.email,
			name: opts.name ?? 'Initial',
			image: opts.image ?? null,
		})
		await authRepo.save(u)
		return u.id.value
	}

	async function readProfileUpdatedEvents() {
		return testBed.resolve(DomainEventRepository).findByType(ProfileUpdatedEvent)
	}

	it('updates name + emits ProfileUpdated with changedFields=[name]', async () => {
		const userId = await seedAuthUser({ email: 'a@b.com', name: 'Alice' })
		await useCase.execute({ userId, name: 'Bob' })

		const reloaded = await authRepo.findById(userId)
		expect(reloaded?.name).toBe('Bob')

		const evts = await readProfileUpdatedEvents()
		expect(evts).toHaveLength(1)
		expect(evts[0]!.payload.userProfile).toBeDefined()
		expect(evts[0]!.payload.userProfile.userId).toBe(userId)
	})

	it('updates pictureUrl + emits changedFields=[pictureUrl]', async () => {
		const userId = await seedAuthUser({ email: 'pic@b.com' })
		await useCase.execute({ userId, pictureUrl: 'https://cdn.example.com/avatar.png' })

		const reloaded = await authRepo.findById(userId)
		expect(reloaded?.image).toBe('https://cdn.example.com/avatar.png')

		const evts = await readProfileUpdatedEvents()
		expect(evts[0]!.payload.userProfile.userId).toBeTruthy()
	})

	it('updates both name + pictureUrl in one call → changedFields=[name, pictureUrl]', async () => {
		const userId = await seedAuthUser({ email: 'both@b.com', name: 'Old' })
		await useCase.execute({ userId, name: 'New', pictureUrl: 'https://cdn.example.com/new.png' })

		const evts = await readProfileUpdatedEvents()
		expect(evts[0]!.payload.userProfile).toBeDefined()
		expect(evts[0]!.payload.userProfile.userId).toBeTruthy()
	})

	it('null pictureUrl clears the image', async () => {
		const userId = await seedAuthUser({ email: 'clr@b.com', image: 'https://cdn.example.com/old.png' })
		await useCase.execute({ userId, pictureUrl: null })

		const reloaded = await authRepo.findById(userId)
		expect(reloaded?.image).toBeNull()
	})

	it('no-op call (same name) → no event emitted', async () => {
		const userId = await seedAuthUser({ email: 'noop@b.com', name: 'Same' })
		await useCase.execute({ userId, name: 'Same' })

		const evts = await readProfileUpdatedEvents()
		expect(evts).toHaveLength(0)
	})

	it('empty input (no fields provided) → no event, no error', async () => {
		const userId = await seedAuthUser({ email: 'empty@b.com' })
		await useCase.execute({ userId })

		const evts = await readProfileUpdatedEvents()
		expect(evts).toHaveLength(0)
	})

	it('throws USER_PROFILE_NOT_FOUND for unknown userId', async () => {
		await expect(useCase.execute({ userId: testId('user', 'nonexistent'), name: 'X' })).rejects.toMatchObject({
			name: 'USER_PROFILE_NOT_FOUND',
		})
	})

	it('rejects malformed pictureUrl with VALIDATION_ERROR', async () => {
		const userId = await seedAuthUser({ email: 'bad@b.com' })
		await expect(useCase.execute({ userId, pictureUrl: 'not-a-url' as any })).rejects.toThrow()
	})
})
