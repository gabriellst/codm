// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, testId, givenOwner } from '@test/support'
import { DomainEventRepository } from '@codedm/core-typescript'
import { Role } from '../enums/Role'
import { AcceptInvitation } from './AcceptInvitation'
import { InviteMember } from './InviteMember'
import { OwnerMembershipRepository } from '../repositories/OwnerMembershipRepository'
import { OwnerInvitationRepository } from '../repositories/OwnerInvitationRepository'
import { OwnerMemberAddedEvent, OwnerMemberInvitedEvent } from '../events'

const INVITER_ID = testId('user', '1')
const ACCEPTOR_ID = testId('user', '2')
const ANOTHER_USER = testId('user', '3')

describe('AcceptInvitation use case (C16)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let accept: AcceptInvitation
	let invite: InviteMember
	let memberships: OwnerMembershipRepository
	let invitations: OwnerInvitationRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
		accept = testBed.resolve(AcceptInvitation)
		invite = testBed.resolve(InviteMember)
		memberships = testBed.resolve(OwnerMembershipRepository)
		invitations = testBed.resolve(OwnerInvitationRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	async function issueInvitationEnvelope(opts: {
		ownerId: string
		email?: string
		role?: Role
	}): Promise<{ envelope: string; ownerInvitationId: string }> {
		const out = await invite.execute({
			ownerId: opts.ownerId,
			invitedByUserId: INVITER_ID,
			email: opts.email ?? 'invitee@b.com',
			role: opts.role ?? Role.MEMBER,
		})
		// Pull the envelope from the OwnerMemberInvited event payload (the canonical channel).
		const eventRepo = testBed.resolve(DomainEventRepository)
		const invitedEvts = await eventRepo.findByType(OwnerMemberInvitedEvent)
		const inviteEvt = invitedEvts.find(e => e.payload.ownerInvitationId === out.ownerInvitationId)!
		const envelope: string = inviteEvt.payload.invitationToken
		return { envelope, ownerInvitationId: out.ownerInvitationId }
	}

	async function readMemberAddedEvents() {
		return testBed.resolve(DomainEventRepository).findByType(OwnerMemberAddedEvent)
	}

	it('happy path: persists membership + flips invitation + emits OwnerMemberAdded', async () => {
		const ownerId = (await givenOwner(testBed)).id.value
		const { envelope, ownerInvitationId } = await issueInvitationEnvelope({ ownerId })

		const out = await accept.execute({ userId: ACCEPTOR_ID, invitationToken: envelope })
		expect(out.ownerId).toBe(ownerId)
		expect(out.role).toBe(Role.MEMBER)

		// Membership row exists.
		const membership = await memberships.findByOwnerAndUser(ownerId, ACCEPTOR_ID)
		expect(membership?.role).toBe(Role.MEMBER)

		// Invitation now ACCEPTED.
		const reloaded = await invitations.findById(ownerInvitationId)
		expect(reloaded?.acceptedAt).toBeInstanceOf(Date)
		expect(reloaded?.acceptedByUserId?.value).toBe(ACCEPTOR_ID)

		// OwnerMemberAdded emitted by THIS accept call.
		const added = await readMemberAddedEvents()
		expect(added).toHaveLength(1)
		expect(added[0]!.payload.userId).toBe(ACCEPTOR_ID)
		expect(added[0]!.payload.ownerId).toBe(ownerId)
		expect(added[0]!.payload.role).toBe(Role.MEMBER)
	})

	it('throws INVALID_INVITATION_TOKEN for a tampered envelope', async () => {
		const ownerId = (await givenOwner(testBed)).id.value
		const { envelope } = await issueInvitationEnvelope({ ownerId })
		const [b64, plainToken, sig] = envelope.split('.')
		const tampered = `${b64}.${plainToken}.${sig!.slice(0, -2)}aa`

		await expect(accept.execute({ userId: ACCEPTOR_ID, invitationToken: tampered })).rejects.toMatchObject({
			name: 'INVALID_INVITATION_TOKEN',
		})
	})

	it('throws INVALID_INVITATION_TOKEN when envelope sid points to a deleted invitation', async () => {
		const ownerId = (await givenOwner(testBed)).id.value
		const { envelope, ownerInvitationId } = await issueInvitationEnvelope({ ownerId })

		// Simulate the row being deleted between issuance and accept.
		await invitations.delete(ownerInvitationId)

		await expect(accept.execute({ userId: ACCEPTOR_ID, invitationToken: envelope })).rejects.toMatchObject({
			name: 'INVALID_INVITATION_TOKEN',
		})
	})

	it('throws INVITATION_ALREADY_USED on replay', async () => {
		const ownerId = (await givenOwner(testBed)).id.value
		const { envelope } = await issueInvitationEnvelope({ ownerId })

		await accept.execute({ userId: ACCEPTOR_ID, invitationToken: envelope })

		await expect(accept.execute({ userId: ANOTHER_USER, invitationToken: envelope })).rejects.toMatchObject({
			name: 'INVITATION_ALREADY_USED',
		})
	})

	it('throws INVITATION_EXPIRED when the persisted entity expiry is past', async () => {
		const ownerId = (await givenOwner(testBed)).id.value
		const { envelope, ownerInvitationId } = await issueInvitationEnvelope({ ownerId })

		// Force-expire the persisted invitation row (envelope `exp` is 7-day default).
		const inv = (await invitations.findById(ownerInvitationId))!
		;(inv as any).expiresAt = new Date(Date.now() - 60_000)
		await invitations.save(inv)

		await expect(accept.execute({ userId: ACCEPTOR_ID, invitationToken: envelope })).rejects.toMatchObject({ name: 'INVITATION_EXPIRED' })
	})

	it('forwards the invitee role from the invitation (e.g. ADMIN)', async () => {
		const ownerId = (await givenOwner(testBed)).id.value
		const { envelope } = await issueInvitationEnvelope({ ownerId, role: Role.ADMIN })

		const out = await accept.execute({ userId: ACCEPTOR_ID, invitationToken: envelope })
		expect(out.role).toBe(Role.ADMIN)

		const membership = await memberships.findByOwnerAndUser(ownerId, ACCEPTOR_ID)
		expect(membership?.role).toBe(Role.ADMIN)
	})
})
