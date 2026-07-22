// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, testId } from '@test/support'
import { DomainEventRepository } from '@codedm/core-typescript'
import { Role } from '../enums/Role'
import { ChangeMemberRole } from './ChangeMemberRole'
import { Owner } from '../entities/Owner'
import { OwnerKind } from '@shared/enums'
import { OwnerMembership } from '../entities/OwnerMembership'
import { OwnerRepository } from '../repositories/OwnerRepository'
import { OwnerMembershipRepository } from '../repositories/OwnerMembershipRepository'
import { OwnerMemberRoleChangedEvent } from '../events'

const OWNER_A = testId('user', '1')
const OWNER_B = testId('user', '2')
const MEMBER_C = testId('user', '3')
const MEMBER_E = testId('user', 'e')
const ABSENT_D = testId('user', 'd')

describe('ChangeMemberRole use case (C18)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let changeRole: ChangeMemberRole
	let ownerRepo: OwnerRepository
	let memberships: OwnerMembershipRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
		changeRole = testBed.resolve(ChangeMemberRole)
		ownerRepo = testBed.resolve(OwnerRepository)
		memberships = testBed.resolve(OwnerMembershipRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	async function seedOwner(): Promise<string> {
		const s = Owner.create({
			name: 'Acme',
			kind: OwnerKind.ORGANIZATION,
			responsibleUserId: '019e4d24-6524-7041-9e1c-8108180cddae',
			timezone: 'UTC',
		})
		await ownerRepo.save(s)
		return s.id.value
	}

	// Typed event read straight from the repository — no DrizzleClient, no cast.
	async function readRoleChangedEvents() {
		return testBed.resolve(DomainEventRepository).findByType(OwnerMemberRoleChangedEvent)
	}

	it('promotes MEMBER → ADMIN: persists + emits OwnerMemberRoleChanged{oldRole,newRole}', async () => {
		const ownerId = await seedOwner()
		await memberships.save(OwnerMembership.forOwner({ ownerId, userId: OWNER_A }))
		await memberships.save(OwnerMembership.forInvitee({ ownerId, userId: MEMBER_C, role: Role.MEMBER }))

		await changeRole.execute({ ownerId, ids: [MEMBER_C], newRole: Role.ADMIN })

		const reloaded = await memberships.findByOwnerAndUser(ownerId, MEMBER_C)
		expect(reloaded?.role).toBe(Role.ADMIN)

		const evs = await readRoleChangedEvents()
		expect(evs).toHaveLength(1)
		const { payload } = evs[0]!
		expect(payload.oldRole).toBe(Role.MEMBER)
		expect(payload.newRole).toBe(Role.ADMIN)
		expect(payload.userId).toBe(MEMBER_C)
		expect(payload.ownerId).toBe(ownerId)
	})

	it('bulk: promotes several MEMBERs → ADMIN, one event per member', async () => {
		const ownerId = await seedOwner()
		await memberships.save(OwnerMembership.forOwner({ ownerId, userId: OWNER_A }))
		await memberships.save(OwnerMembership.forInvitee({ ownerId, userId: MEMBER_C, role: Role.MEMBER }))
		await memberships.save(OwnerMembership.forInvitee({ ownerId, userId: MEMBER_E, role: Role.MEMBER }))

		await changeRole.execute({ ownerId, ids: [MEMBER_C, MEMBER_E], newRole: Role.ADMIN })

		expect((await memberships.findByOwnerAndUser(ownerId, MEMBER_C))?.role).toBe(Role.ADMIN)
		expect((await memberships.findByOwnerAndUser(ownerId, MEMBER_E))?.role).toBe(Role.ADMIN)
		expect(await readRoleChangedEvents()).toHaveLength(2)
	})

	it('throws CANNOT_DEMOTE_LAST_OWNER when demoting the only OWNER', async () => {
		const ownerId = await seedOwner()
		await memberships.save(OwnerMembership.forOwner({ ownerId, userId: OWNER_A }))

		await expect(changeRole.execute({ ownerId, ids: [OWNER_A], newRole: Role.ADMIN })).rejects.toMatchObject({
			name: 'CANNOT_DEMOTE_LAST_OWNER',
		})

		const still = await memberships.findByOwnerAndUser(ownerId, OWNER_A)
		expect(still?.role).toBe(Role.RESPONSIBLE)
		expect(await readRoleChangedEvents()).toHaveLength(0)
	})

	it('allows demoting one OWNER when another OWNER exists', async () => {
		const ownerId = await seedOwner()
		await memberships.save(OwnerMembership.forOwner({ ownerId, userId: OWNER_A }))
		await memberships.save(OwnerMembership.forOwner({ ownerId, userId: OWNER_B }))

		await changeRole.execute({ ownerId, ids: [OWNER_A], newRole: Role.ADMIN })

		const reloaded = await memberships.findByOwnerAndUser(ownerId, OWNER_A)
		expect(reloaded?.role).toBe(Role.ADMIN)
		expect((await readRoleChangedEvents())[0]!.payload.oldRole).toBe(Role.RESPONSIBLE)
	})

	it('no-op when newRole === currentRole: no save, no event', async () => {
		const ownerId = await seedOwner()
		await memberships.save(OwnerMembership.forOwner({ ownerId, userId: OWNER_A }))
		await memberships.save(OwnerMembership.forInvitee({ ownerId, userId: MEMBER_C, role: Role.MEMBER }))

		const before = await memberships.findByOwnerAndUser(ownerId, MEMBER_C)
		const versionBefore = (before as any).version

		await changeRole.execute({ ownerId, ids: [MEMBER_C], newRole: Role.MEMBER })

		// No event.
		expect(await readRoleChangedEvents()).toHaveLength(0)

		// Row not written: version unchanged (save() increments version).
		const after = await memberships.findByOwnerAndUser(ownerId, MEMBER_C)
		expect((after as any).version).toBe(versionBefore)
	})

	it('throws OWNER_MEMBERSHIP_NOT_FOUND when the membership does not exist', async () => {
		const ownerId = await seedOwner()
		await memberships.save(OwnerMembership.forOwner({ ownerId, userId: OWNER_A }))

		await expect(changeRole.execute({ ownerId, ids: [ABSENT_D], newRole: Role.ADMIN })).rejects.toMatchObject({
			name: 'OWNER_MEMBERSHIP_NOT_FOUND',
		})
		expect(await readRoleChangedEvents()).toHaveLength(0)
	})

	it('promotes OWNER → OWNER is a no-op (no event)', async () => {
		// Edge: re-applying OWNER to an OWNER must not double-count or fire the LAST_OWNER guard.
		const ownerId = await seedOwner()
		await memberships.save(OwnerMembership.forOwner({ ownerId, userId: OWNER_A }))

		await changeRole.execute({ ownerId, ids: [OWNER_A], newRole: Role.RESPONSIBLE })
		expect(await readRoleChangedEvents()).toHaveLength(0)
	})
})
