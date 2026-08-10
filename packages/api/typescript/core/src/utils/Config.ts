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
	// Data directory for the REAL daemon (founder decision 3: 2 processes, one embedded DB — no
	// external Postgres). It holds `codm.db`, the SINGLE shared SQLite file that the Go gateway
	// opens too, plus its `-wal`/`-shm` companions and this daemon's `daemon.lock`; migrations apply
	// on boot from either process, idempotently. A leading `~` expands to $HOME in the driver factory.
	// Tests pass no dbPath (a process-scoped temp file) and never read this key.
	CODM_DATA_DIR: z.string().default('~/.codm/data'),
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
	// Cloud profile only (SP2): social-provider credentials for the resurrected better-auth instance
	// (auth/services/Authentication/BetterAuth.ts). Kernel-scoped like BETTER_AUTH_SECRET/URL above —
	// the auth bounded context itself ships in the base template, not a per-product add-on. Empty
	// defaults keep the LOCAL daemon profile (which never constructs BetterAuth) booting without them.
	GITHUB_CLIENT_ID: z.string().default(''),
	GITHUB_CLIENT_SECRET: z.string().default(''),
	GOOGLE_CLIENT_ID: z.string().default(''),
	GOOGLE_CLIENT_SECRET: z.string().default(''),
	// Cloud profile's own public origin — better-auth's trustedOrigins (distinct from
	// CORS_ALLOWED_ORIGINS, which governs the general API's cross-origin allowlist). Cross-field
	// default (falls back to API_URL) resolved in the .transform() below.
	CODM_CLOUD_URL: z.string().optional(),
	REDIS_URL: z.string().default('redis://localhost:6379'),
	// api-go public base URL — targeted by the SDK aggregate client (shared/registry) AND the
	// external/ChannelProxy reverse proxy (`${API_GO_URL}/api`). No apikey seam here: the gateway's
	// own CHANNEL_GLOBAL_API_KEY guard stays empty in proxied deployments (auth lives on the api-ts
	// hop — OperatorMiddleware), so the former CODM_GATEWAY_API_KEY key was removed with the
	// per-endpoint ui proxies that were its only consumers.
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
	// Seleção de ambiente do boot por PROCESSO (spec Decision 7, eixo-único-de-ambiente): o único
	// gatilho por env var — `index.ts` repassa a `start({ env: Config.env.CODM_ENV })`. `mock`/
	// `integration` continuam seleção programática (TestBed/harness), nunca por env var; daí o
	// enum aqui ser um subconjunto de `BoundedContextEnvironment`.
	CODM_ENV: z.enum(['real', 'e2e']).default('real'),
	// Raw boot flag que seleciona QUAIS contextos montam (ex.: 'cloud') — lido cru em alguns pontos
	// pré-Config por necessidade de boot (ver superRefine acima); tipado aqui para os consumidores
	// pós-Config.
	CODM_PROFILE: z.string().default(''),
	// Modo de emissão de OpenAPI (bun sdk / emit-openapi): sob 'true' o boot só coleta rotas para
	// gerar o spec — sem tocar persistência real, sem enfileirar jobs/comandos.
	EMIT_OPENAPI: z.string().default(''),
	// Companion flag to EMIT_OPENAPI (T5, process.env exclusive-to-Config rail): under emission mode
	// the boot normally exits right after writing the spec (`server.ts`); the `emit-openapi` nx target
	// sets this to 'false' explicitly (project.json) to make that intent visible at the call site. A
	// future combined "emit + keep serving" boot sets it 'true'.
	START_SERVER: z.string().default(''),
	// Inactivity watchdog backstop for `ClaudeAgentRunner` (§4.3 rule 5) — no frame for this long means
	// the run is wedged. `z.coerce` mirrors the previous `Number(process.env.X ?? default)` behavior for
	// a set value; an unparseable override now fails loud at boot instead of silently becoming `NaN`.
	CODM_AGENT_INACTIVITY_MS: z.coerce.number().default(180_000),
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
 *
 * Keyed by the PROFILE that actually consumes the secret, because "must be real" is a property of
 * who signs with it, not of NODE_ENV. The desktop daemon runs with `NODE_ENV=production` too (the
 * Tauri shell hard-codes it for the sidecar), so a flat list meant the packaged app refused to boot
 * over `BETTER_AUTH_SECRET` — a secret only `auth/services/Authentication/BetterAuth.ts` reads, and
 * that context is mounted ONLY under `CODM_PROFILE=cloud`. Measured 2026-08-07: no install could
 * open; the daemon died on this guard before serving a single request.
 *
 * `JWT_SECRET` is deliberately absent: it has ZERO consumers in this fork (grep across ts/go/rust —
 * only its own declaration). Guarding a key nothing signs with buys no security and costs a boot.
 * It stays declared as template lineage; the day something signs with it, it joins a profile below.
 */
const NO_PLACEHOLDER_BY_PROFILE = {
	/** better-auth signs sessions with it — the cloud slice is the only place it runs. */
	cloud: ['BETTER_AUTH_SECRET'],
} as const satisfies Record<string, readonly EnvKey[]>
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
	// Computed BEFORE the CODM_CLOUD_URL cross-field default below overwrites it — `Config.env.
	// CODM_CLOUD_URL` cross-field-defaults to API_URL and is therefore ALWAYS a truthy string, so it
	// cannot express "the operator never set this". CLOUD_CONFIGURED is the typed answer to that
	// question (FileCloudSession.isCloudConfigured, T5): no raw env var of its own, purely derived from
	// whether the RAW field was present.
	const CLOUD_CONFIGURED = Boolean(data.CODM_CLOUD_URL)
	const CODM_CLOUD_URL = data.CODM_CLOUD_URL ?? API_URL

	return {
		...data,
		API_URL,
		APP_URL,
		BETTER_AUTH_URL,
		CODM_CLOUD_URL,
		CLOUD_CONFIGURED,
	}
}).superRefine((data, ctx) => {
	if (data.NODE_ENV !== 'production') return

	const missingSecrets = REQUIRED_SECRETS_IN_PROD.filter(key => !data[key])
	if (missingSecrets.length > 0) {
		ctx.addIssue({ code: 'custom', message: `Missing required secrets in production: ${missingSecrets.join(', ')}` })
	}

	// The profile is a raw boot flag (see template.config.ts CODM_PROFILE, schema: 'raw') — read here
	// rather than through the schema for the same reason src/index.ts does: it selects what boots.
	const profile = process.env.CODM_PROFILE ?? ''
	const guarded: readonly EnvKey[] = NO_PLACEHOLDER_BY_PROFILE[profile as keyof typeof NO_PLACEHOLDER_BY_PROFILE] ?? []
	const placeholderSecrets = guarded.filter(key => data[key] === PLACEHOLDER_SECRET)
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
