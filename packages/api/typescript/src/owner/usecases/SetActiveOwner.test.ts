import { testId } from '@test/support'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenUser, givenOwner, givenActiveSession } from '@test/support'
import { DrizzleDatabaseDriver, DrizzleTransaction } from '@codm/core-typescript'
import { eq } from 'drizzle-orm'
import { sessions } from '@codm/contracts/db'
import { SetActiveOwner } from './SetActiveOwner'
import { Owner } from '../entities/Owner'
import { OwnerKind } from '@codm/contracts-typescript/wire/enums'
import { DrizzleOwnerRepository } from '../repositories/OwnerRepository'

describe('SetActiveOwner use case (SPEC-07)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let setActiveOwner: SetActiveOwner
	let ownerRepo: DrizzleOwnerRepository
	let db: DrizzleTransaction
	let driver: DrizzleDatabaseDriver

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })

		db = (testContainer.resolve(DrizzleDatabaseDriver as any) as DrizzleDatabaseDriver).db
		driver = testContainer.resolve(DrizzleDatabaseDriver as any) as DrizzleDatabaseDriver

		// Manually construct repos and use case to bypass tsyringe emitDecoratorMetadata
		// issue in Bun test isolation (all integration-mode use-case tests share this pattern).
		ownerRepo = new DrizzleOwnerRepository(driver)

		// The use case WRITES, so it takes the driver's write seam, not the read client.
		setActiveOwner = new SetActiveOwner(ownerRepo, driver)
		setActiveOwner.bindContainer(testContainer)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('throws OWNER_NOT_FOUND when the user is not the responsible user', async () => {
		const user = await givenUser(testBed)
		const s = Owner.create({
			name: 'Other',
			kind: OwnerKind.ORGANIZATION,
			responsibleUserId: testId('set-active-owner', 'responsible-user'),
			timezone: 'UTC',
		})
		await ownerRepo.save(s)

		await expect(setActiveOwner.execute({ ownerId: s.id.value, userId: user.id.value, sessionId: 'session-none' })).rejects.toMatchObject({
			name: 'OWNER_NOT_FOUND',
		})
	})

	it('returns the updated ownerId when the user is the responsible user', async () => {
		const user = await givenUser(testBed)
		const owner = await givenOwner(testBed, { responsibleUserId: user.id.value })
		const { sessionId } = await givenActiveSession(testBed, user.id.value)

		const result = await setActiveOwner.execute({
			ownerId: owner.id.value,
			userId: user.id.value,
			sessionId,
		})

		expect(result.ownerId).toBe(owner.id.value)
	})

	it('writes active_owner_id to the sessions row', async () => {
		const user = await givenUser(testBed)
		const owner = await givenOwner(testBed, { responsibleUserId: user.id.value })
		const { sessionId } = await givenActiveSession(testBed, user.id.value)

		await setActiveOwner.execute({ ownerId: owner.id.value, userId: user.id.value, sessionId })

		const rows = await db.select({ activeOwnerId: sessions.activeOwnerId }).from(sessions).where(eq(sessions.id, sessionId))
		expect(rows[0]?.activeOwnerId).toBe(owner.id.value)
	})
})
