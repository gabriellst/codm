import { describe, it, expect } from 'bun:test'
import { renderResetPasswordEmail, renderAccountCreatedEmail } from './index'

describe('auth email templates', () => {
	it('reset password email contains the name and the reset url', async () => {
		const msg = await renderResetPasswordEmail({ name: 'Alice', url: 'http://localhost:5173/reset-password?token=abc123' })
		expect(msg.subject.length).toBeGreaterThan(0)
		expect(msg.body).toContain('Alice')
		expect(msg.body).toContain('http://localhost:5173/reset-password?token=abc123')
	})

	it('account-created email contains the name', async () => {
		const msg = await renderAccountCreatedEmail({ name: 'Bob' })
		expect(msg.subject.length).toBeGreaterThan(0)
		expect(msg.body).toContain('Bob')
	})
})
