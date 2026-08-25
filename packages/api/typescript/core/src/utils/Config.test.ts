import { describe, expect, it } from 'bun:test'
import os from 'node:os'
import { EnvSchema } from './Config'
import { defaultDataDir } from './UserConfigDir'

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

/**
 * O default de CODM_DATA_DIR é o diretório que o gateway Go abre quando ninguém lhe passa um
 * (`store.go` `resolveDataDir("")`). Era `~/.<produto>/data` — um daemon avulso sem `.env` abria
 * o mesmo arquivo de banco (`<produto>.db`) numa pasta diferente, que o gateway nunca veria. O
 * shell desktop SEMPRE injeta a chave, então isto só governa o dev standalone; mas é exatamente aí
 * que dois bancos silenciosos custam uma tarde.
 *
 * Paridade do NOME da pasta: aqui o produto deriva de PROJECT (fallback 'app'); o Go alinha na task
 * irmã follow-up 'go-datadir-project' (o gateway ainda literaliza o nome do produto em store.go:344).
 */
describe('CODM_DATA_DIR default — o mesmo diretório que o gateway Go abre', () => {
	it('sem a chave, resolve para <UserConfigDir>/<produto> desta plataforma (nunca mais ~/.<produto>/data)', () => {
		const result = EnvSchema.safeParse({})

		expect(result.success).toBe(true)
		const expected = defaultDataDir({ platform: process.platform, env: process.env, home: os.homedir() }, process.env.PROJECT ?? 'app')
		expect(result.data?.CODM_DATA_DIR).toBe(expected)
		expect(result.data?.CODM_DATA_DIR.startsWith('~')).toBe(false)
	})

	it('com a chave, o valor passa intocado — o shell injeta o app_data_dir dele e o .env o seu', () => {
		const result = EnvSchema.safeParse({ CODM_DATA_DIR: '~/.acme/data' })

		expect(result.data?.CODM_DATA_DIR).toBe('~/.acme/data')
	})
})
