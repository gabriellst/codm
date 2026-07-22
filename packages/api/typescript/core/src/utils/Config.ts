import { z } from 'zod'

/**
 * Raw field-level env schema — one entry per env var, each reproducing the exact default/coercion
 * semantics of the previous hand-rolled `process.env.X ?? default` object so `Config.env` keeps
 * identical keys and types for identical inputs.
 *
 * KERNEL SCOPE — this schema holds ONLY generic, product-agnostic env (DB/Redis/OTEL/PORT,
 * generic secrets, credential-vault key). Product-specific env (payment
 * provider / marketing / store-integration OAuth credentials) lives in the product env seam at
 * `src/shared/config/ProductConfig.ts`, mirroring medscall's `src/shared` product Config. Rule of
 * thumb: would a brand-new product still need this var? Yes → kernel; no → the seam.
 *
 * Fields whose default depends on a SIBLING field's resolved value (API_URL, APP_URL,
 * BETTER_AUTH_URL key off API_PORT/NODE_ENV;
 * Zod has no cross-field `.default()`) are left `.optional()` here and resolved in the object-level
 * `.transform()` below.
 *
 * ref: medscall@96fd1eac (Config.env = EnvSchema.parse(process.env), assertRequiredSecrets → superRefine)
 */
const RawEnvSchema = z.object({
	NODE_ENV: z.string().default('development'),
	API_PORT: z.coerce.number().default(3030),
	API_URL: z.string().optional(),
	APP_URL: z.string().optional(),
	DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/postgres'),
	// Embedded, file-backed PGlite data directory for the REAL daemon (founder decision 3: 2 processes,
	// embedded DB — no external Postgres). The `real` DrizzleDatabaseDriver is a file-backed PGlite rooted
	// here; migrations apply on boot (idempotent). A leading `~` expands to $HOME in the driver factory.
	// Tests keep in-memory PGlite (no dataDir) and never read this key.
	CODEDM_DATA_DIR: z.string().default('~/.codedm/data'),
	OTEL_COLLECTOR_TRACE_URL: z.string().default(''),
	OTEL_SERVICE_NAME: z.string().default('service'),
	OTEL_COLLECTOR_LOG_URL: z.string().default(''),
	CORS_ALLOWED_ORIGINS: z
		.string()
		.optional()
		.transform(v => v?.split(',') ?? ['*']),
	JWT_SECRET: z.string().default('SECRET'),
	BETTER_AUTH_SECRET: z.string().default('SECRET'),
	BETTER_AUTH_URL: z.string().optional(),
	REDIS_URL: z.string().default('redis://localhost:6379'),
	// api-go public base URL — the SDK aggregate client (shared/registry) targets the Go service with it.
	API_GO_URL: z.string().default('http://localhost:3032'),
	// Declared escape hatch for hermetic test stacks (the e2e runner sets it): the sign-in/up
	// windows are per-IP, and a full suite from one host legitimately exceeds them.
	RATE_LIMIT_DISABLED: z
		.string()
		.default('false')
		.transform(v => v === 'true'),
	API_EVENT_GROUP_ID: z.string().default('monorepo-api'),
	// 32-byte AES-256 key, base64-encoded (44 chars with padding).
	// Generated via `openssl rand -base64 32`. Required for sealing/opening credential-vault
	// payloads in production (enforced by the `.superRefine()` below); tests construct the vault
	// directly with a test key (no Config dep). Generic kernel secret — any product that stores
	// per-tenant external credentials needs it.
	CREDENTIAL_VAULT_KEY: z.string().optional(),
	// Platform operator credential — gates operator-only endpoints (e.g. quota's ApplyQuotaOverride
	// via the X-Operator-Key header, constant-time compared). Generic kernel secret: any product
	// with a back-office/ops surface needs one. Defaults to '' so the compare fails CLOSED when
	// unset (an empty expected key rejects every request). medscall@f04e8a0f: Config.env.OPERATOR_API_KEY.
	OPERATOR_API_KEY: z.string().default(''),
	// Shared secret for service-to-service calls (e.g. the Go worker calling
	// the credential-exchange endpoint). Sent as the `x-internal-service-key`
	// header. Empty in dev rejects all S2S calls — set in any env that uses them.
	INTERNAL_SERVICE_KEY: z.string().default(''),
})

/** Structural parity export — the env-model architecture rail compares these against the
 *  template.config.ts REPO.env registry (owner: kernel). */
export const KERNEL_ENV_KEYS = Object.keys(RawEnvSchema.shape)

type EnvKey = keyof z.infer<typeof RawEnvSchema>

/**
 * Secrets required to be present in every production boot. Declarative list + generic loop below
 * replaces a hand-rolled imperative guard — the same shape as medscall's `GATEWAY_SECRETS` /
 * `ALWAYS_REQUIRED_IN_PROD` tables, scoped here to the vars the kernel actually reads.
 *
 * Empty in the base template: no kernel service is bound that requires a secret unconditionally.
 * A product that binds AesCredentialVault re-adds 'CREDENTIAL_VAULT_KEY' here (an empty vault key
 * in production means credentials cannot be sealed — the boot must refuse to start).
 */
const REQUIRED_SECRETS_IN_PROD = [] as const satisfies readonly EnvKey[]

/**
 * Secrets that ship a placeholder default for local dev but MUST be overridden in production —
 * booting prod with the literal `'SECRET'` signing key is a security hole, not a valid config.
 */
const NO_PLACEHOLDER_IN_PROD = ['JWT_SECRET', 'BETTER_AUTH_SECRET'] as const satisfies readonly EnvKey[]
const PLACEHOLDER_SECRET = 'SECRET'

/**
 * Full env schema — resolves the cross-field derived defaults (API_URL, APP_URL, BETTER_AUTH_URL) and enforces the boot-time production secrets guard.
 *
 * `NODE_ENV === 'production'` is intentional (NOT `!== 'development'`): this schema is parsed once
 * at module load — i.e. on every `Config` import, including every test file (Bun's test runner sets
 * `NODE_ENV=test`). A `!== 'development'` check would treat `'test'` as production-like and fire the
 * guard on every test. Only a literal `NODE_ENV=production` boot enforces the secrets invariants.
 */
export const EnvSchema = RawEnvSchema.transform(data => {
	const API_URL = data.API_URL ?? `http://localhost:${data.API_PORT}`
	const APP_URL = data.APP_URL ?? (data.NODE_ENV === 'development' ? 'http://localhost:5173' : API_URL)
	const BETTER_AUTH_URL = data.BETTER_AUTH_URL ?? `http://localhost:${data.API_PORT}/v1/authentication`

	return {
		...data,
		API_URL,
		APP_URL,
		BETTER_AUTH_URL,
	}
}).superRefine((data, ctx) => {
	if (data.NODE_ENV !== 'production') return

	const missingSecrets = REQUIRED_SECRETS_IN_PROD.filter(key => !data[key])
	if (missingSecrets.length > 0) {
		ctx.addIssue({ code: 'custom', message: `Missing required secrets in production: ${missingSecrets.join(', ')}` })
	}

	const placeholderSecrets = NO_PLACEHOLDER_IN_PROD.filter(key => data[key] === PLACEHOLDER_SECRET)
	if (placeholderSecrets.length > 0) {
		ctx.addIssue({
			code: 'custom',
			message: `Placeholder secrets not allowed in production (override the dev default): ${placeholderSecrets.join(', ')}`,
		})
	}
})

export const Config = {
	name: `${process.env.PROJECT ?? 'template'}-${process.env.SERVICE ?? 'backend'}`,
	version: process.env.VERSION ?? 'v1',
	project: process.env.PROJECT ?? 'project',
	service: process.env.SERVICE ?? 'service',
	env: EnvSchema.parse(process.env),
} as const
