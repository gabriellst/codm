import { describe, expect, it } from 'bun:test'
import { EnvSchema } from './Config'

/**
 * The boot-time secrets guard, and the incident that shaped it.
 *
 * On 2026-08-07 no installed app could open: the Tauri shell starts the daemon sidecar with
 * `NODE_ENV=production` (sidecars/mod.rs), and the guard was a FLAT list demanding a real
 * `BETTER_AUTH_SECRET` — a secret whose only reader is `auth/services/Authentication/BetterAuth.ts`,
 * a context mounted exclusively under `CODM_PROFILE=cloud`. The desktop daemon died on a check
 * protecting nothing it runs, before serving a single request.
 *
 * So the guard is keyed by the PROFILE that consumes the secret. These cases pin both halves: the
 * cloud slice still refuses a placeholder (the security property), and the desktop daemon boots
 * (the availability property). Delete the profile lookup and the second case goes red.
 */
describe('production secrets guard', () => {
	const PROD_ENV = { NODE_ENV: 'production', BETTER_AUTH_SECRET: 'SECRET', JWT_SECRET: 'SECRET' }

	/** Parses with CODM_PROFILE forced to `profile`, restoring whatever the ambient value was. */
	const parseUnderProfile = (profile: string, env: Record<string, string>) => {
		const previous = process.env.CODM_PROFILE
		if (profile === '') delete process.env.CODM_PROFILE
		else process.env.CODM_PROFILE = profile
		try {
			return EnvSchema.safeParse(env)
		} finally {
			if (previous === undefined) delete process.env.CODM_PROFILE
			else process.env.CODM_PROFILE = previous
		}
	}

	it('refuses the placeholder in the cloud profile — better-auth would sign sessions with it', () => {
		const result = parseUnderProfile('cloud', PROD_ENV)

		expect(result.success).toBe(false)
		expect(JSON.stringify(result.error?.issues)).toContain('BETTER_AUTH_SECRET')
	})

	it('lets the packaged desktop daemon boot — it never mounts the context that reads the secret', () => {
		const result = parseUnderProfile('', PROD_ENV)

		expect(result.success).toBe(true)
	})

	it('never guards JWT_SECRET — nothing in this fork signs with it', () => {
		const result = parseUnderProfile('cloud', PROD_ENV)

		expect(JSON.stringify(result.error?.issues)).not.toContain('JWT_SECRET')
	})
})
