import { describe, it, expect } from 'bun:test'
import { SignUpInputSchema } from './SignUp'
import { ResetPasswordInputSchema } from './ResetPassword'

describe('auth doc-controller schemas', () => {
	it('SignUp rejects mismatched passwords with PASSWORDS_DONT_MATCH', () => {
		const result = SignUpInputSchema.safeParse({
			body: { name: 'Al', email: 'a@b.com', password: 'StrongPass1', confirmPassword: 'Different1' },
		})
		expect(result.success).toBe(false)
		expect(JSON.stringify(result.error)).toContain('PASSWORDS_DONT_MATCH')
	})

	it('SignUp accepts matching passwords', () => {
		const result = SignUpInputSchema.safeParse({
			body: { name: 'Al', email: 'a@b.com', password: 'StrongPass1', confirmPassword: 'StrongPass1' },
		})
		expect(result.success).toBe(true)
	})

	it('SignUp does not accept a phone field (removed from the template contract) — a stray key is stripped', () => {
		const result = SignUpInputSchema.safeParse({
			body: { name: 'Al', email: 'a@b.com', password: 'StrongPass1', confirmPassword: 'StrongPass1', phone: '+5511999999999' },
		})
		expect(result.success).toBe(true)
		if (result.success) expect('phone' in result.data.body).toBe(false)
	})

	it('ResetPassword rejects mismatched passwords with PASSWORDS_DONT_MATCH', () => {
		const result = ResetPasswordInputSchema.safeParse({
			body: { token: 't', newPassword: 'StrongPass1', confirmNewPassword: 'Different1' },
		})
		expect(result.success).toBe(false)
		expect(JSON.stringify(result.error)).toContain('PASSWORDS_DONT_MATCH')
	})
})
