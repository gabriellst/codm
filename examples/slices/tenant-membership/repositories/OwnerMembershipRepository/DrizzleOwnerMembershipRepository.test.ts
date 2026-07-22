// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenOwner, givenUser } from '@test/support'
import { Role } from '../../enums/Role'
import { OwnerMembership } from '../../entities/OwnerMembership'
import { OwnerMembershipRepository } from './OwnerMembershipRepository'

describe('DrizzleOwnerMembershipRepository (integration)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let repo: OwnerMembershipRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
		repo = testBed.resolve(OwnerMembershipRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	async function seedOwner(name = 'Acme'): Promise<string> {
		return (await givenOwner(testBed, { name })).id.value
	}

	async function seedUser(email: string): Promise<string> {
		return (await givenUser(testBed, { email })).id.value
	}

	it('save + findByOwnerAndUser round-trips role + composite identity', async () => {
		const ownerId = await seedOwner()
		const userId = await seedUser('a@b.com')
		const m = OwnerMembership.forOwner({ ownerId, userId })
		await repo.save(m)

		const found = await repo.findByOwnerAndUser(ownerId, userId)
		expect(found?.ownerId.value).toBe(ownerId)
		expect(found?.userId.value).toBe(userId)
		expect(found?.role).toBe(Role.RESPONSIBLE)
	})

	it('findById accepts the composite encoded as "${ownerId}:${userId}"', async () => {
		const ownerId = await seedOwner()
		const userId = await seedUser('id@b.com')
		await repo.save(OwnerMembership.forInvitee({ ownerId, userId, role: Role.MEMBER }))

		const found = await repo.findById(`${ownerId}:${userId}`)
		expect(found?.role).toBe(Role.MEMBER)

		const malformed = await repo.findById('not-a-composite')
		expect(malformed).toBeUndefined()
	})

	it('findByOwnerId returns all memberships for the owner', async () => {
		const ownerId = await seedOwner()
		const userA = await seedUser('a@b.com')
		const userB = await seedUser('b@b.com')
		const userC = await seedUser('c@b.com')
		await repo.save(OwnerMembership.forOwner({ ownerId, userId: userA }))
		await repo.save(OwnerMembership.forInvitee({ ownerId, userId: userB, role: Role.ADMIN }))
		await repo.save(OwnerMembership.forInvitee({ ownerId, userId: userC, role: Role.MEMBER }))

		const list = await repo.findByOwnerId(ownerId)
		expect(list).toHaveLength(3)
		expect(list.map(m => m.role).sort()).toEqual([Role.ADMIN, Role.MEMBER, Role.RESPONSIBLE])
	})

	it('findByUserId returns all owners the user belongs to', async () => {
		const ownerA = await seedOwner('A')
		const ownerB = await seedOwner('B')
		const userId = await seedUser('u@b.com')
		await repo.save(OwnerMembership.forOwner({ ownerId: ownerA, userId }))
		await repo.save(OwnerMembership.forInvitee({ ownerId: ownerB, userId, role: Role.MEMBER }))

		const list = await repo.findByUserId(userId)
		expect(list).toHaveLength(2)
		expect(list.map(m => m.ownerId.value).sort()).toEqual([ownerA, ownerB].sort())
	})

	it('countOwnersByOwnerId counts only OWNER memberships scoped to the owner', async () => {
		const ownerId = await seedOwner()
		const owner1 = await seedUser('o1@b.com')
		const owner2 = await seedUser('o2@b.com')
		const admin = await seedUser('admin@b.com')
		const member = await seedUser('member@b.com')
		await repo.save(OwnerMembership.forOwner({ ownerId, userId: owner1 }))
		await repo.save(OwnerMembership.forOwner({ ownerId, userId: owner2 }))
		await repo.save(OwnerMembership.forInvitee({ ownerId, userId: admin, role: Role.ADMIN }))
		await repo.save(OwnerMembership.forInvitee({ ownerId, userId: member, role: Role.MEMBER }))

		const n = await repo.countOwnersByOwnerId(ownerId)
		expect(n).toBe(2)
	})

	it('findByOwnerAndEmail joins auth.users — finds existing member by email', async () => {
		const ownerId = await seedOwner()
		const userId = await seedUser('match@b.com')
		await repo.save(OwnerMembership.forInvitee({ ownerId, userId, role: Role.MEMBER }))

		const found = await repo.findByOwnerAndEmail(ownerId, 'match@b.com')
		expect(found?.userId.value).toBe(userId)

		const missing = await repo.findByOwnerAndEmail(ownerId, 'unknown@b.com')
		expect(missing).toBeUndefined()
	})

	it('findByOwnerAndEmail returns undefined when email exists but not in this owner', async () => {
		const ownerA = await seedOwner('A')
		const ownerB = await seedOwner('B')
		const userId = await seedUser('cross@b.com')
		await repo.save(OwnerMembership.forOwner({ ownerId: ownerA, userId }))

		// Member of ownerA, but lookup in ownerB → should not find
		const notInB = await repo.findByOwnerAndEmail(ownerB, 'cross@b.com')
		expect(notInB).toBeUndefined()
	})

	it('removeByOwnerAndUser deletes the membership', async () => {
		const ownerId = await seedOwner()
		const userId = await seedUser('del@b.com')
		await repo.save(OwnerMembership.forOwner({ ownerId, userId }))
		expect(await repo.findByOwnerAndUser(ownerId, userId)).toBeDefined()

		await repo.removeByOwnerAndUser(ownerId, userId)
		expect(await repo.findByOwnerAndUser(ownerId, userId)).toBeUndefined()
	})

	it('save UPSERTs on (ownerId, userId) — changeRole + re-save persists new role', async () => {
		const ownerId = await seedOwner()
		const userId = await seedUser('rl@b.com')
		const m = OwnerMembership.forInvitee({ ownerId, userId, role: Role.MEMBER })
		await repo.save(m)

		m.changeRole(Role.ADMIN)
		await repo.save(m)

		const reloaded = await repo.findByOwnerAndUser(ownerId, userId)
		expect(reloaded?.role).toBe(Role.ADMIN)
	})
})
