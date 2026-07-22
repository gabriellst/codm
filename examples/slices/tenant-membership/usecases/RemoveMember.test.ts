// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, testId, givenOwner, givenOwnerMembership } from '@test/support'
import { DomainEventRepository } from '@codedm/core-typescript'
import { Role } from '../enums/Role'
import { RemoveMember } from './RemoveMember'
import { OwnerMembershipRepository } from '../repositories/OwnerMembershipRepository'
import { OwnerMemberRemovedEvent } from '../events'

const OWNER_A = testId('user', 'owner-a')
const OWNER_B = testId('user', 'owner-b')
const MEMBER_C = testId('user', 'member-c')
const MEMBER_E = testId('user', 'member-e')
const ABSENT_D = testId('user', 'absent-d')

describe('RemoveMember use case (C17)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let remove: RemoveMember
	let memberships: OwnerMembershipRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
		remove = testBed.resolve(RemoveMember)
		memberships = testBed.resolve(OwnerMembershipRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	async function readRemovedEvents() {
		return testBed.resolve(DomainEventRepository).findByType(OwnerMemberRemovedEvent)
	}

	it('removes a non-OWNER member + emits OwnerMemberRemoved', async () => {
		const owner = await givenOwner(testBed)
		const ownerId = owner.id.value
		await givenOwnerMembership(testBed, { ownerId, userId: OWNER_A, role: Role.RESPONSIBLE })
		await givenOwnerMembership(testBed, { ownerId, userId: MEMBER_C, role: Role.MEMBER })

		const out = await remove.execute({ ownerId, ids: [MEMBER_C] })
		expect(out.removed).toBe(true)

		// Row gone.
		const gone = await memberships.findByOwnerAndUser(ownerId, MEMBER_C)
		expect(gone).toBeUndefined()

		// OWNER still there.
		const ownerMember = await memberships.findByOwnerAndUser(ownerId, OWNER_A)
		expect(ownerMember?.role).toBe(Role.RESPONSIBLE)

		// Event emitted.
		const removed = await readRemovedEvents()
		expect(removed).toHaveLength(1)
		expect(removed[0]!.payload.userId).toBe(MEMBER_C)
		expect(removed[0]!.payload.ownerId).toBe(ownerId)
	})

	it('bulk: removes several non-OWNER members, one event per member', async () => {
		const owner = await givenOwner(testBed)
		const ownerId = owner.id.value
		await givenOwnerMembership(testBed, { ownerId, userId: OWNER_A, role: Role.RESPONSIBLE })
		await givenOwnerMembership(testBed, { ownerId, userId: MEMBER_C, role: Role.MEMBER })
		await givenOwnerMembership(testBed, { ownerId, userId: MEMBER_E, role: Role.MEMBER })

		const out = await remove.execute({ ownerId, ids: [MEMBER_C, MEMBER_E] })
		expect(out.removed).toBe(true)

		expect(await memberships.findByOwnerAndUser(ownerId, MEMBER_C)).toBeUndefined()
		expect(await memberships.findByOwnerAndUser(ownerId, MEMBER_E)).toBeUndefined()
		expect(await readRemovedEvents()).toHaveLength(2)
	})

	it('throws CANNOT_REMOVE_LAST_OWNER when removing the only OWNER', async () => {
		const owner = await givenOwner(testBed)
		const ownerId = owner.id.value
		await givenOwnerMembership(testBed, { ownerId, userId: OWNER_A, role: Role.RESPONSIBLE })

		await expect(remove.execute({ ownerId, ids: [OWNER_A] })).rejects.toMatchObject({ name: 'CANNOT_REMOVE_LAST_OWNER' })

		// Row preserved + no event emitted.
		const still = await memberships.findByOwnerAndUser(ownerId, OWNER_A)
		expect(still?.role).toBe(Role.RESPONSIBLE)
		expect(await readRemovedEvents()).toHaveLength(0)
	})

	it('allows removing one OWNER when another OWNER exists', async () => {
		const owner = await givenOwner(testBed)
		const ownerId = owner.id.value
		await givenOwnerMembership(testBed, { ownerId, userId: OWNER_A, role: Role.RESPONSIBLE })
		await givenOwnerMembership(testBed, { ownerId, userId: OWNER_B, role: Role.RESPONSIBLE })

		const out = await remove.execute({ ownerId, ids: [OWNER_A] })
		expect(out.removed).toBe(true)

		const remaining = await memberships.findByOwnerId(ownerId)
		expect(remaining).toHaveLength(1)
		expect(remaining[0]!.userId.value).toBe(OWNER_B)
	})

	it('throws OWNER_MEMBERSHIP_NOT_FOUND when the membership does not exist', async () => {
		const owner = await givenOwner(testBed)
		const ownerId = owner.id.value
		await givenOwnerMembership(testBed, { ownerId, userId: OWNER_A, role: Role.RESPONSIBLE })

		await expect(remove.execute({ ownerId, ids: [ABSENT_D] })).rejects.toMatchObject({ name: 'OWNER_MEMBERSHIP_NOT_FOUND' })
		expect(await readRemovedEvents()).toHaveLength(0)
	})
})
