// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { describe, expect, it } from 'bun:test'
import { testId } from '@test/support'
import { InvitationTokenService } from './InvitationTokenService'

const OWNER_INVITATION_ID = testId('ownerInvitation', '1')

describe('InvitationTokenService (HMAC envelope)', () => {
	const svc = new InvitationTokenService()

	it('generate + verify round-trips payload + plainToken', () => {
		const token = svc.generate({
			ownerInvitationId: OWNER_INVITATION_ID,
			email: 'invitee@b.com',
			plainToken: 'plain-secret',
		})

		const decoded = svc.verify(token)
		expect(decoded.sid).toBe(OWNER_INVITATION_ID)
		expect(decoded.email).toBe('invitee@b.com')
		expect(decoded.plainToken).toBe('plain-secret')
		expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000))
	})

	it('produced token is a 3-part envelope: ${b64}.${plainToken}.${sig}', () => {
		const token = svc.generate({
			ownerInvitationId: OWNER_INVITATION_ID,
			email: 'a@b.com',
			plainToken: 'tok',
		})
		const parts = token.split('.')
		expect(parts).toHaveLength(3)
		expect(parts[1]).toBe('tok')
	})

	it('tampering with the payload breaks signature → INVALID_INVITATION_TOKEN', () => {
		const token = svc.generate({
			ownerInvitationId: OWNER_INVITATION_ID,
			email: 'a@b.com',
			plainToken: 'tok',
		})
		const [, plainToken, sig] = token.split('.')
		const fakePayload = Buffer.from(JSON.stringify({ sid: 'other-id', email: 'a@b.com', exp: 9999999999 })).toString('base64url')
		const tampered = `${fakePayload}.${plainToken}.${sig}`

		expect(() => svc.verify(tampered)).toThrow(expect.objectContaining({ name: 'INVALID_INVITATION_TOKEN' }))
	})

	it('tampering with the plainToken breaks signature', () => {
		const token = svc.generate({
			ownerInvitationId: OWNER_INVITATION_ID,
			email: 'a@b.com',
			plainToken: 'right',
		})
		const [b64, , sig] = token.split('.')
		const tampered = `${b64}.wrong.${sig}`

		expect(() => svc.verify(tampered)).toThrow(expect.objectContaining({ name: 'INVALID_INVITATION_TOKEN' }))
	})

	it('malformed envelope (wrong segment count) → INVALID_INVITATION_TOKEN', () => {
		expect(() => svc.verify('not.enough')).toThrow(expect.objectContaining({ name: 'INVALID_INVITATION_TOKEN' }))
	})

	it('expired envelope → INVITATION_EXPIRED', () => {
		// ttlSec=-3600 puts exp in the past.
		const token = svc.generate({
			ownerInvitationId: OWNER_INVITATION_ID,
			email: 'a@b.com',
			plainToken: 'tok',
			ttlSec: -3600,
		})
		expect(() => svc.verify(token)).toThrow(expect.objectContaining({ name: 'INVITATION_EXPIRED' }))
	})

	it('verify uses timingSafeEqual — different-length sigs do not throw a non-typed error', () => {
		const token = svc.generate({
			ownerInvitationId: OWNER_INVITATION_ID,
			email: 'a@b.com',
			plainToken: 'tok',
		})
		const [b64, plainToken] = token.split('.')
		// Truncated sig (different length) — must still produce a typed BaseError, not crash.
		const truncated = `${b64}.${plainToken}.abc`
		expect(() => svc.verify(truncated)).toThrow(expect.objectContaining({ name: 'INVALID_INVITATION_TOKEN' }))
	})
})
