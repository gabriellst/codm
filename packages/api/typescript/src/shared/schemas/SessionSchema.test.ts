import { describe, it, expect } from 'bun:test'
import { testId } from '@test/support'
import { SessionSchema } from './SessionSchema'

const USER_ID = testId('user', '1')

describe('SessionSchema', () => {
	it('parses a valid session payload', () => {
		const userId = USER_ID
		const raw = {
			user: { id: 'u-1', email: 'a@b.com', name: 'Alice', emailVerified: true },
			session: { id: 's-1', userId, expiresAt: new Date().toISOString(), ownerId: null },
		}
		const result = SessionSchema.safeParse(raw)
		expect(result.success).toBe(true)
		if (!result.success) return
		expect(result.data.user.id).toBe('u-1')
		expect(result.data.session.userId).toBe(userId)
		expect(result.data.session.expiresAt).toBeInstanceOf(Date)
		expect(result.data.session.ownerId).toBeNull()
	})

	it('rejects a payload missing user.id', () => {
		const raw = {
			user: { email: 'a@b.com', name: 'Alice', emailVerified: true },
			session: { id: 's-1', userId: USER_ID, expiresAt: new Date().toISOString() },
		}
		expect(SessionSchema.safeParse(raw).success).toBe(false)
	})

	it('coerces expiresAt ISO string to Date', () => {
		const iso = '2030-01-01T00:00:00.000Z'
		const userId = USER_ID
		const raw = {
			user: { id: 'u-1', email: 'a@b.com', name: null, emailVerified: false },
			session: { id: 's-1', userId, expiresAt: iso, ownerId: 'store-1' },
		}
		const result = SessionSchema.safeParse(raw)
		expect(result.success).toBe(true)
		if (!result.success) return
		expect(result.data.session.expiresAt).toBeInstanceOf(Date)
		expect(result.data.session.expiresAt.toISOString()).toBe(iso)
	})
})
