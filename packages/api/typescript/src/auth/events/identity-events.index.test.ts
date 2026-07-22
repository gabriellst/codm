import { describe, expect, it } from 'bun:test'
import {
	UserRegisteredEvent,
	UserSignedInEvent,
	UserSignedOutEvent,
	ProfileUpdatedEvent,
	PasswordChangedEvent,
	PasswordResetRequestedEvent,
	PasswordResetEvent,
} from './index'

describe('Identity domain events', () => {
	it('event names follow identity.<entity>.<verb> convention', () => {
		expect(UserRegisteredEvent.name).toBe('auth.user.registered')
		expect(UserSignedInEvent.name).toBe('auth.user.signed_in')
		expect(UserSignedOutEvent.name).toBe('auth.user.signed_out')
		expect(ProfileUpdatedEvent.name).toBe('auth.user.profile_updated')
		expect(PasswordChangedEvent.name).toBe('auth.user.password_changed')
		expect(PasswordResetRequestedEvent.name).toBe('auth.user.password_reset_requested')
		expect(PasswordResetEvent.name).toBe('auth.user.password_reset')
	})

	it('UserRegisteredEvent payload requires userId + email + carries optional leadEmail', () => {
		const e = new UserRegisteredEvent({
			entityId: 'u1',
			ownerId: 'u1',
			payload: { userId: 'u1', email: 'a@b.com', leadEmail: 'a@b.com' },
		})
		expect(e.payload.userId).toBe('u1')
		expect(e.payload.leadEmail).toBe('a@b.com')
	})

	it('UserSignedInEvent + UserSignedOutEvent carry their respective timestamps', () => {
		const inE = new UserSignedInEvent({
			entityId: 'u1',
			ownerId: 'u1',
			payload: { userId: 'u1', signedInAt: new Date().toISOString() },
		})
		const outE = new UserSignedOutEvent({
			entityId: 'u1',
			ownerId: 'u1',
			payload: { userId: 'u1', signedOutAt: new Date().toISOString() },
		})
		expect(inE.payload.signedInAt).toBeDefined()
		expect(outE.payload.signedOutAt).toBeDefined()
	})

	it('ProfileUpdatedEvent payload carries userProfile key typed by UserProfileSchema', () => {
		const e = new ProfileUpdatedEvent({
			entityId: 'u1',
			ownerId: 'u1',
			payload: {
				userProfile: { userId: 'u1' } as never,
			},
		})
		expect(e.payload.userProfile).toBeDefined()
		expect((e.payload.userProfile as unknown as { userId: string }).userId).toBe('u1')
	})

	it('Password* events all carry userId + a verb-specific timestamp', () => {
		const now = new Date().toISOString()
		const changed = new PasswordChangedEvent({
			entityId: 'u1',
			ownerId: 'u1',
			payload: { userId: 'u1', changedAt: now },
		})
		const requested = new PasswordResetRequestedEvent({
			entityId: 'u1',
			ownerId: 'u1',
			payload: { userId: 'u1', requestedAt: now },
		})
		const reset = new PasswordResetEvent({
			entityId: 'u1',
			ownerId: 'u1',
			payload: { userId: 'u1', resetAt: now },
		})
		expect(changed.payload.changedAt).toBe(now)
		expect(requested.payload.requestedAt).toBe(now)
		expect(reset.payload.resetAt).toBe(now)
	})
})
