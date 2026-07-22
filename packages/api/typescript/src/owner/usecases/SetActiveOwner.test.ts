import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenUser, givenOwner } from '@test/support'
import { DrizzleClient } from '@template/core-typescript'
import { eq } from 'drizzle-orm'
import { sessions } from '@template/contracts/db'
import { SetActiveOwner } from './SetActiveOwner'
import { Owner } from '../entities/Owner'
import { OwnerKind } from '@template/contracts-typescript/wire/enums'
import { DrizzleOwnerRepository } from '../repositories/OwnerRepository'

const SESSION_ID = 'session-abc-123'

describe('SetActiveOwner use case (SPEC-07)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let setActiveOwner: SetActiveOwner
	let ownerRepo: DrizzleOwnerRepository
	let db: DrizzleClient

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })

		db = testContainer.resolve(DrizzleClient as any) as DrizzleClient

		// Manually construct repos and use case to bypass tsyringe emitDecoratorMetadata
		// issue in Bun test isolation (all integration-mode use-case tests share this pattern).
		ownerRepo = new DrizzleOwnerRepository(db)

		setActiveOwner = new SetActiveOwner(ownerRepo)
		setActiveOwner.bindContainer(testContainer)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	async function seedSession(sessionId: string, userId: string): Promise<void> {
		await db.insert(sessions).values({
			id: sessionId,
			userId,
			token: `token-${sessionId}`,
			expiresAt: new Date(Date.now() + 86_400_000),
		})
	}

	it('throws OWNER_NOT_FOUND when the user is not the responsible user', async () => {
		const user = await givenUser(testBed)
		const s = Owner.create({
			name: 'Other',
			kind: OwnerKind.ORGANIZATION,
			responsibleUserId: '019e4d24-6524-7041-9e1c-8108180cddae',
			timezone: 'UTC',
		})
		await ownerRepo.save(s)

		await expect(setActiveOwner.execute({ ownerId: s.id.value, userId: user.id.value, sessionId: SESSION_ID })).rejects.toMatchObject({
			name: 'OWNER_NOT_FOUND',
		})
	})

	it('returns the updated ownerId when the user is the responsible user', async () => {
		const user = await givenUser(testBed)
		const owner = await givenOwner(testBed, { responsibleUserId: user.id.value })
		await seedSession(SESSION_ID, user.id.value)

		const result = await setActiveOwner.execute({
			ownerId: owner.id.value,
			userId: user.id.value,
			sessionId: SESSION_ID,
		})

		expect(result.ownerId).toBe(owner.id.value)
	})

	it('writes active_owner_id to the sessions row', async () => {
		const user = await givenUser(testBed)
		const owner = await givenOwner(testBed, { responsibleUserId: user.id.value })
		await seedSession(SESSION_ID, user.id.value)

		await setActiveOwner.execute({ ownerId: owner.id.value, userId: user.id.value, sessionId: SESSION_ID })

		const rows = await db.select({ activeOwnerId: sessions.activeOwnerId }).from(sessions).where(eq(sessions.id, SESSION_ID))
		expect(rows[0]?.activeOwnerId).toBe(owner.id.value)
	})
})
