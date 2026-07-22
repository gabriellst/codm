// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, testId, givenOwner } from '@test/support'
import { Role } from '../../enums/Role'
import { OwnerInvitation } from '../../entities/OwnerInvitation'
import { OwnerInvitationRepository } from './OwnerInvitationRepository'

describe('DrizzleOwnerInvitationRepository (integration)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let repo: OwnerInvitationRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
		repo = testBed.resolve(OwnerInvitationRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('save + findById round-trips all fields incl. token hash', async () => {
		const ownerId = (await givenOwner(testBed)).id.value
		const inv = OwnerInvitation.issue({
			ownerId,
			email: 'invitee@b.com',
			role: Role.MEMBER,
			plainToken: 'plain-secret',
		})
		await repo.save(inv)

		const found = await repo.findById(inv.id.value)
		expect(found).toBeDefined()
		expect(found?.ownerId.value).toBe(ownerId)
		expect(found?.email).toBe('invitee@b.com')
		expect(found?.role).toBe(Role.MEMBER)
		expect(found?.token).toBe(inv.token)
		expect(found?.acceptedAt).toBeUndefined()
		expect(found?.acceptedByUserId).toBeUndefined()
	})

	it('findById returns undefined for unknown id', async () => {
		const found = await repo.findById(testId())
		expect(found).toBeUndefined()
	})

	it('findByToken looks up by the sha256 hash', async () => {
		const ownerId = (await givenOwner(testBed)).id.value
		const inv = OwnerInvitation.issue({
			ownerId,
			email: 't@b.com',
			role: Role.MEMBER,
			plainToken: 'tok',
		})
		await repo.save(inv)

		const found = await repo.findByToken(inv.token)
		expect(found?.id.value).toBe(inv.id.value)

		const missing = await repo.findByToken('a'.repeat(64))
		expect(missing).toBeUndefined()
	})

	it('findPendingByOwnerAndEmail filters acceptedAt IS NULL AND expiresAt > now', async () => {
		const ownerId = (await givenOwner(testBed)).id.value
		const pending = OwnerInvitation.issue({
			ownerId,
			email: 'pending@b.com',
			role: Role.MEMBER,
			plainToken: 'p',
		})
		await repo.save(pending)

		const found = await repo.findPendingByOwnerAndEmail(ownerId, 'pending@b.com')
		expect(found?.id.value).toBe(pending.id.value)

		const wrongEmail = await repo.findPendingByOwnerAndEmail(ownerId, 'other@b.com')
		expect(wrongEmail).toBeUndefined()
	})

	it('findPendingByOwnerAndEmail skips accepted invitations', async () => {
		const ownerId = (await givenOwner(testBed)).id.value
		const accepted = OwnerInvitation.issue({
			ownerId,
			email: 'a@b.com',
			role: Role.MEMBER,
			plainToken: 'p1',
		})
		accepted.accept({ userId: testId('user', '99'), plainToken: 'p1' })
		await repo.save(accepted)

		const found = await repo.findPendingByOwnerAndEmail(ownerId, 'a@b.com')
		expect(found).toBeUndefined()
	})

	it('findPendingByOwnerAndEmail skips expired invitations', async () => {
		const ownerId = (await givenOwner(testBed)).id.value
		const expired = OwnerInvitation.issue({
			ownerId,
			email: 'x@b.com',
			role: Role.MEMBER,
			plainToken: 'p',
			ttlHours: 1,
		})
		;(expired as any).expiresAt = new Date(Date.now() - 60_000)
		await repo.save(expired)

		const found = await repo.findPendingByOwnerAndEmail(ownerId, 'x@b.com')
		expect(found).toBeUndefined()
	})

	it('findPendingByOwnerId returns all pending; excludes accepted + expired', async () => {
		const ownerId = (await givenOwner(testBed)).id.value
		const pendingA = OwnerInvitation.issue({
			ownerId,
			email: 'a@b.com',
			role: Role.MEMBER,
			plainToken: 'a',
		})
		const pendingB = OwnerInvitation.issue({
			ownerId,
			email: 'b@b.com',
			role: Role.ADMIN,
			plainToken: 'b',
		})
		const accepted = OwnerInvitation.issue({
			ownerId,
			email: 'c@b.com',
			role: Role.MEMBER,
			plainToken: 'c',
		})
		accepted.accept({ userId: testId('user', '99'), plainToken: 'c' })
		const expired = OwnerInvitation.issue({
			ownerId,
			email: 'd@b.com',
			role: Role.MEMBER,
			plainToken: 'd',
		})
		;(expired as any).expiresAt = new Date(Date.now() - 60_000)

		await repo.save(pendingA)
		await repo.save(pendingB)
		await repo.save(accepted)
		await repo.save(expired)

		const list = await repo.findPendingByOwnerId(ownerId)
		expect(list).toHaveLength(2)
		expect(list.map(i => i.email).sort()).toEqual(['a@b.com', 'b@b.com'])
	})

	it('save UPSERTs — accept() + re-save persists acceptedAt + acceptedByUserId', async () => {
		const ownerId = (await givenOwner(testBed)).id.value
		const inv = OwnerInvitation.issue({
			ownerId,
			email: 'acc@b.com',
			role: Role.MEMBER,
			plainToken: 'tok',
		})
		await repo.save(inv)

		const acceptingUser = testId('user', '77')
		inv.accept({ userId: acceptingUser, plainToken: 'tok' })
		await repo.save(inv)

		const reloaded = await repo.findById(inv.id.value)
		expect(reloaded?.acceptedAt).toBeInstanceOf(Date)
		expect(reloaded?.acceptedByUserId?.value).toBe(acceptingUser)
	})

	it('delete removes the row', async () => {
		const ownerId = (await givenOwner(testBed)).id.value
		const inv = OwnerInvitation.issue({
			ownerId,
			email: 'del@b.com',
			role: Role.MEMBER,
			plainToken: 'd',
		})
		await repo.save(inv)

		await repo.delete(inv.id.value)
		expect(await repo.findById(inv.id.value)).toBeUndefined()
	})
})
