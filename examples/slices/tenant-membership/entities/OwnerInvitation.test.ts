// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { describe, expect, it } from 'bun:test'
import { BaseError } from '@template/core-typescript'
import { Role as OwnerRole } from '../enums/Role'
import { testId } from '@test/support'
import { OwnerInvitation } from './OwnerInvitation'

const OWNER_ID = testId('owner', '1')
const USER_ID = testId('user', '1')
const SECOND_USER = testId('user', '2')

describe('OwnerInvitation aggregate', () => {
	it('issue constructs with sha256-hashed token + expiresAt = now + 7 days (default)', () => {
		const before = Date.now()
		const inv = OwnerInvitation.issue({
			ownerId: OWNER_ID,
			email: 'invitee@b.com',
			role: OwnerRole.MEMBER,
			plainToken: 'plain-secret',
		})

		expect(inv.email).toBe('invitee@b.com')
		expect(inv.role).toBe(OwnerRole.MEMBER)
		expect(inv.token).toHaveLength(64) // sha256 hex
		expect(inv.token).not.toBe('plain-secret')
		expect(inv.acceptedAt).toBeUndefined()
		expect(inv.acceptedByUserId).toBeUndefined()

		const ttlMs = 168 * 3600 * 1000
		expect(inv.expiresAt.getTime()).toBeGreaterThanOrEqual(before + ttlMs - 1000)
		expect(inv.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + ttlMs + 1000)
	})

	it('custom ttlHours shortens the expiry', () => {
		const before = Date.now()
		const inv = OwnerInvitation.issue({
			ownerId: OWNER_ID,
			email: 'invitee@b.com',
			role: OwnerRole.ADMIN,
			plainToken: 'tok',
			ttlHours: 1,
		})
		expect(inv.expiresAt.getTime()).toBeLessThanOrEqual(before + 3600 * 1000 + 1000)
	})

	it('rejects malformed email at construction time', () => {
		expect(() =>
			OwnerInvitation.issue({
				ownerId: OWNER_ID,
				email: 'not-an-email',
				role: OwnerRole.MEMBER,
				plainToken: 'tok',
			}),
		).toThrow(BaseError)
	})

	it('accept with the correct plain token sets acceptedAt + acceptedByUserId', () => {
		const inv = OwnerInvitation.issue({
			ownerId: OWNER_ID,
			email: 'a@b.com',
			role: OwnerRole.MEMBER,
			plainToken: 'tok-correct',
		})
		inv.accept({ userId: USER_ID, plainToken: 'tok-correct' })
		expect(inv.acceptedAt).toBeInstanceOf(Date)
		expect(inv.acceptedByUserId?.value).toBe(USER_ID)
	})

	it('accept with the wrong plain token throws INVALID_INVITATION_TOKEN', () => {
		const inv = OwnerInvitation.issue({
			ownerId: OWNER_ID,
			email: 'a@b.com',
			role: OwnerRole.MEMBER,
			plainToken: 'tok-right',
		})
		expect(() => inv.accept({ userId: USER_ID, plainToken: 'tok-wrong' })).toThrow(
			expect.objectContaining({ name: 'INVALID_INVITATION_TOKEN' }),
		)
		expect(inv.acceptedAt).toBeUndefined()
	})

	it('accept after expiry throws INVITATION_EXPIRED', () => {
		const inv = OwnerInvitation.issue({
			ownerId: OWNER_ID,
			email: 'a@b.com',
			role: OwnerRole.MEMBER,
			plainToken: 'tok',
			ttlHours: 0.0001, // ~0.36s
		})
		// Force-expire by writing to the entity directly (faster than waiting).
		;(inv as any).expiresAt = new Date(Date.now() - 1000)

		expect(() => inv.accept({ userId: USER_ID, plainToken: 'tok' })).toThrow(expect.objectContaining({ name: 'INVITATION_EXPIRED' }))
	})

	it('accept twice throws INVITATION_ALREADY_USED on the second call', () => {
		const inv = OwnerInvitation.issue({
			ownerId: OWNER_ID,
			email: 'a@b.com',
			role: OwnerRole.MEMBER,
			plainToken: 'tok',
		})
		inv.accept({ userId: USER_ID, plainToken: 'tok' })

		expect(() => inv.accept({ userId: SECOND_USER, plainToken: 'tok' })).toThrow(
			expect.objectContaining({ name: 'INVITATION_ALREADY_USED' }),
		)
	})

	it('isPending true when unaccepted + unexpired; false otherwise', () => {
		const fresh = OwnerInvitation.issue({
			ownerId: OWNER_ID,
			email: 'a@b.com',
			role: OwnerRole.MEMBER,
			plainToken: 'tok',
		})
		expect(fresh.isPending()).toBe(true)

		fresh.accept({ userId: USER_ID, plainToken: 'tok' })
		expect(fresh.isPending()).toBe(false)

		const expired = OwnerInvitation.issue({
			ownerId: OWNER_ID,
			email: 'b@b.com',
			role: OwnerRole.MEMBER,
			plainToken: 'tok2',
		})
		;(expired as any).expiresAt = new Date(Date.now() - 1000)
		expect(expired.isPending()).toBe(false)
	})

	it('two issues with the same plainToken produce identical token hashes', () => {
		const a = OwnerInvitation.issue({
			ownerId: OWNER_ID,
			email: 'a@b.com',
			role: OwnerRole.MEMBER,
			plainToken: 'same',
		})
		const b = OwnerInvitation.issue({
			ownerId: OWNER_ID,
			email: 'b@b.com',
			role: OwnerRole.MEMBER,
			plainToken: 'same',
		})
		expect(a.token).toBe(b.token)
	})
})
