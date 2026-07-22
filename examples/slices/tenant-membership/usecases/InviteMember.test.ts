// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, testId, givenOwner } from '@test/support'
import { DomainEventRepository } from '@codedm/core-typescript'
import { Role } from '../enums/Role'
import { InviteMember } from './InviteMember'
import { OwnerMembership } from '../entities/OwnerMembership'
import { OwnerInvitation } from '../entities/OwnerInvitation'
import { OwnerMembershipRepository } from '../repositories/OwnerMembershipRepository'
import { OwnerInvitationRepository } from '../repositories/OwnerInvitationRepository'
import { InvitationTokenService } from '../services/InvitationTokenService'
import { OwnerMemberInvitedEvent } from '../events'
import { UserRepository as AuthUserRepository } from '@auth/repositories/UserRepository/UserRepository'
import { User as AuthUser } from '@auth/entities'

const INVITER_ID = testId('user', '1')

describe('InviteMember use case (C15)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let useCase: InviteMember
	let memberships: OwnerMembershipRepository
	let invitations: OwnerInvitationRepository
	let authRepo: AuthUserRepository
	let tokens: InvitationTokenService

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
		useCase = testBed.resolve(InviteMember)
		memberships = testBed.resolve(OwnerMembershipRepository)
		invitations = testBed.resolve(OwnerInvitationRepository)
		authRepo = testBed.resolve(AuthUserRepository)
		tokens = testBed.resolve(InvitationTokenService)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	async function readEvents() {
		return testBed.resolve(DomainEventRepository).findByType(OwnerMemberInvitedEvent)
	}

	it('happy path: persists invitation + emits OwnerMemberInvited with signed envelope', async () => {
		const owner = await givenOwner(testBed, { name: 'Acme', timezone: 'UTC' })
		const ownerId = owner.id.value

		const out = await useCase.execute({
			ownerId,
			invitedByUserId: INVITER_ID,
			email: 'invitee@b.com',
			role: Role.MEMBER,
		})

		expect(out.ownerInvitationId).toBeDefined()

		const reloaded = await invitations.findById(out.ownerInvitationId)
		expect(reloaded).toBeDefined()
		expect(reloaded?.email).toBe('invitee@b.com')
		expect(reloaded?.role).toBe(Role.MEMBER)
		expect(reloaded?.acceptedAt).toBeUndefined()
		expect(reloaded?.token).toHaveLength(64) // sha256 hex

		const evts = await readEvents()
		expect(evts).toHaveLength(1)
		expect(evts[0]!.payload.ownerId).toBe(ownerId)
		expect(evts[0]!.payload.ownerInvitationId).toBe(out.ownerInvitationId)
		expect(evts[0]!.payload.email).toBe('invitee@b.com')
		expect(evts[0]!.payload.role).toBe(Role.MEMBER)
		// Envelope: ${b64}.${plainToken}.${sig}
		const envelope: string = evts[0]!.payload.invitationToken
		expect(envelope.split('.')).toHaveLength(3)

		// Sanity: verify envelope decodes + plainToken hashes back to entity.token.
		const decoded = tokens.verify(envelope)
		expect(decoded.sid).toBe(out.ownerInvitationId)
		expect(decoded.email).toBe('invitee@b.com')
		// The persisted token is sha256(plainToken); accept() at C16 verifies that.
		expect(decoded.plainToken).not.toBe(reloaded?.token)
	})

	it('throws ALREADY_A_MEMBER when email already has a membership', async () => {
		const owner = await givenOwner(testBed)
		const ownerId = owner.id.value
		// Seed an existing user + membership for email match@b.com.
		const u = AuthUser.create({ email: 'match@b.com', name: 'T' })
		await authRepo.save(u)
		await memberships.save(OwnerMembership.forInvitee({ ownerId, userId: u.id.value, role: Role.MEMBER }))
		// MockOwnerMembershipRepository.findByOwnerAndEmail needs an email
		// directory entry for the userId; the Drizzle impl joins to auth.users.
		// Integration test uses the Drizzle path so seeding auth.users above
		// is sufficient.

		await expect(
			useCase.execute({
				ownerId,
				invitedByUserId: INVITER_ID,
				email: 'match@b.com',
				role: Role.ADMIN,
			}),
		).rejects.toMatchObject({ name: 'ALREADY_A_MEMBER' })
	})

	it('throws INVITATION_ALREADY_PENDING when an unaccepted+unexpired invite exists', async () => {
		const owner = await givenOwner(testBed)
		const ownerId = owner.id.value
		const existing = OwnerInvitation.issue({
			ownerId,
			email: 'pending@b.com',
			role: Role.MEMBER,
			plainToken: 'p',
		})
		await invitations.save(existing)

		await expect(
			useCase.execute({
				ownerId,
				invitedByUserId: INVITER_ID,
				email: 'pending@b.com',
				role: Role.MEMBER,
			}),
		).rejects.toMatchObject({ name: 'INVITATION_ALREADY_PENDING' })
	})

	it('allows re-invite when the previous invitation was accepted (no longer pending)', async () => {
		const owner = await givenOwner(testBed)
		const ownerId = owner.id.value
		const previously = OwnerInvitation.issue({
			ownerId,
			email: 'reinvite@b.com',
			role: Role.MEMBER,
			plainToken: 'p1',
		})
		previously.accept({ userId: INVITER_ID, plainToken: 'p1' })
		await invitations.save(previously)

		const out = await useCase.execute({
			ownerId,
			invitedByUserId: INVITER_ID,
			email: 'reinvite@b.com',
			role: Role.MEMBER,
		})
		expect(out.ownerInvitationId).toBeDefined()
		expect(out.ownerInvitationId).not.toBe(previously.id.value)
	})

	it('allows re-invite when the previous invitation has expired', async () => {
		const owner = await givenOwner(testBed)
		const ownerId = owner.id.value
		const expired = OwnerInvitation.issue({
			ownerId,
			email: 'expired@b.com',
			role: Role.MEMBER,
			plainToken: 'p',
		})
		;(expired as any).expiresAt = new Date(Date.now() - 60_000)
		await invitations.save(expired)

		const out = await useCase.execute({
			ownerId,
			invitedByUserId: INVITER_ID,
			email: 'expired@b.com',
			role: Role.MEMBER,
		})
		expect(out.ownerInvitationId).toBeDefined()
	})
})
