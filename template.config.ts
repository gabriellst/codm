// template.config.ts — the ONE-file repo identity (Plan: .plans/2026-07-11-sync-machinery.md P1-1).
//
// Checked in per repo, NEVER synced by the sync train. Rebranding a fork
// (template → berzerk → medscall → codm) is editing THIS file + regenerating
// (`bun sdk` / `bun contracts`) — never a codemod, for anything DERIVED from
// `scope`/`brand` below. Any generator, script, or tool that needs a brand value
// MUST read it from here; a literal is a bug.
//
// The 2026-07-30 codedm→codm rebrand (`.plans/2026-07-30-a-renames-codm.md`) needed
// a codemod (`scripts/rebrand-codm.ts`, deleted after use — plan D-B) on TOP of this
// file, because four literals do NOT derive from `scope`/`brand` and a hand-edit here
// alone cannot reach them: `rootEnvVar` and `repoUrl` below (literals by design, see
// their own comments), `MCP_SERVER_KEY` (`src/agent/mcp/wire.ts` — a leaf file kept
// import-free on purpose, mirrors `brand`), and `dbFileName` (`core/db/sqlite/store.go`
// — a Go literal, Go cannot import this file). Each is commented at its own site as
// mirroring this config. A future rebrand pays down the same four-literal debt: edit
// this file + regenerate for everything else, then hand-fix those four.
//
// Deliberately dependency-free (plain const object, no imports) so ANY
// script/generator — bun scripts, eslint rule modules loaded via jiti,
// codegen under packages/ — can import it without dragging in a graph.
//
// Go cannot import this file. Go-side seams mirror individual values and name
// this file as their source of truth (see packages/api/go/core/pkg/openapi/walker.go
// `modulePrefix`). Keep them in lockstep when editing here.

const scope = '@codm'
const brand = 'codm'

/**
 * PER-LANGUAGE identity config — facts owned by a language TOOLCHAIN and shared by every
 * workspace of that language (so they don't belong on any single Workspace entry):
 *   typescript.packageScope — the npm scope every TS workspace package lives under.
 *   go.modulePrefix — mirrors the `module <prefix>/...` lines of the Go workspaces
 *   (api-go, core-go, contracts-go, client-go).
 * Exposed as REPO.lang; `REPO.scope` stays as the widely-consumed TS alias.
 */
const LANG_CONFIG = {
	typescript: { packageScope: scope },
	// Go module prefix is DELIBERATELY DECOUPLED from the npm `scope`/`brand`: it is an
	// internal Go module path, not a public brand surface, and Go imports are absolute
	// (`<prefix>/core-go/...`) — renaming it would rewrite every import across the Go tree
	// with zero brand-facing benefit. It intentionally stays `template` through npm-scope
	// rebrands; walker.go mirrors THIS value (source of truth), so there is no stray literal.
	go: { modulePrefix: 'template' },
	// Rust crates derive names from the brand (`codm-contracts-rust`, `codm-client-rust`).
	// Standalone crates, never a language-level Cargo workspace (rust-wire spec §F6): the only
	// Cargo workspace in the repo is the Tauri shell's, which consumes these as path deps.
	rust: { cratePrefix: brand },
} as const

/**
 * WORKSPACES — the first-class table of repo workspaces. LANGUAGE IS A DECLARED PROPERTY here,
 * never inferred from a folder/package NAME (a fork's TS backend may be named `main-back`; a Go
 * service may be named `channel`). `alias` is the human selection token create-template exposes;
 * `kind` drives what is selectable when stamping (shared workspaces always ship).
 */
// ── STAMP-MANAGED: workspaces — create-template re-renders this literal (scripts/create-template/render-manifest.ts): a stamped copy keeps ONLY the entries of kept workspaces; keys must mirror REPO.workspaces (gated by scripts/create-template/render-manifest.test.ts) ──
const WORKSPACES = {
	apiTs: {
		pkgRoot: 'packages/api/typescript',
		srcRoot: 'packages/api/typescript/src',
		lang: 'typescript',
		kind: 'backend',
		alias: 'typescript',
		nxProject: 'api-typescript',
		devServer: 'aggregate',
	},
	apiGo: {
		pkgRoot: 'packages/api/go',
		srcRoot: 'packages/api/go/internal',
		lang: 'go',
		kind: 'backend',
		alias: 'go',
		nxProject: 'api-go',
		devServer: 'aggregate',
	},
	appReact: {
		pkgRoot: 'packages/app/react',
		srcRoot: 'packages/app/react/src',
		lang: 'react',
		kind: 'frontend',
		alias: 'react',
		nxProject: 'app-react',
		devServer: 'aggregate',
	},
	appAstro: {
		pkgRoot: 'packages/app/astro',
		srcRoot: 'packages/app/astro/src',
		lang: 'astro',
		kind: 'frontend',
		alias: 'astro',
		nxProject: 'app-astro',
		devServer: 'aggregate',
	},
	contracts: {
		pkgRoot: 'packages/contracts',
		srcRoot: 'packages/contracts',
		lang: 'typescript',
		kind: 'shared',
		alias: 'contracts',
		nxProject: null,
		devServer: null,
	},
	client: {
		pkgRoot: 'packages/client',
		srcRoot: 'packages/client',
		lang: 'typescript',
		kind: 'shared',
		alias: 'client',
		nxProject: 'client',
		devServer: null,
	},
	e2e: {
		pkgRoot: 'packages/e2e',
		srcRoot: 'packages/e2e',
		lang: 'typescript',
		kind: 'shared',
		alias: 'e2e',
		nxProject: 'e2e',
		devServer: null,
	},
	appTauri: {
		pkgRoot: 'packages/app/tauri',
		srcRoot: 'packages/app/tauri/src-tauri/src',
		lang: 'rust',
		kind: 'shell',
		alias: 'tauri',
		nxProject: 'app-tauri',
		devServer: 'standalone',
		// A shell ships iff everything it hosts ships (create-template keep-rule for kind 'shell').
		requires: ['apiTs', 'apiGo', 'appReact'],
	},
} as const satisfies Record<string, Workspace>
// ── STAMP-MANAGED-END: workspaces ──

export type WorkspaceId = keyof typeof WORKSPACES
export interface Workspace {
	pkgRoot: string
	srcRoot: string
	lang: 'typescript' | 'go' | 'react' | 'astro' | 'rust'
	/** 'shell' = a host that wraps other workspaces (desktop shell) — never selectable on its
	 *  own; it ships iff every workspace in `requires` ships. */
	kind: 'backend' | 'frontend' | 'shared' | 'shell'
	alias: string
	/** kind 'shell' only: the workspaces this shell hosts — the declarative keep-rule. */
	requires?: readonly string[]
	/** nx project name (`project.json` "name") — null = workspace not registered with nx (contracts). */
	nxProject: string | null
	/** How the workspace joins local dev: 'aggregate' = part of the root `bun dev` run-many;
	 *  'standalone' = runs its own dev server; null = no dev target. */
	devServer: 'aggregate' | 'standalone' | null
}

export const REPO = {
	/** npm scope every workspace package lives under (`<scope>/core-typescript`, …). */
	scope,
	/** Human brand label (report titles, generated-doc headers). */
	brand,
	/** GitHub URL — eslint rule docs point here. */
	repoUrl: 'https://github.com/codm/codm',

	// ── Well-known package specifiers (all derived from `scope`) ─────────────
	/** The cross-stack SDK package (Kubb output, committed at packages/client/dist/typescript). */
	sdkPackage: `${scope}/client-typescript`,
	/** The TS-backend subpath of the SDK — the specifier frontend generators emit in import lines. */
	sdkSpecifier: `${scope}/client-typescript/typescript`,
	/** Backend framework core (base classes, z, BaseError, …). */
	corePackage: `${scope}/core-typescript`,
	/** Per-language toolchain identity (see LANG_CONFIG above). */
	lang: LANG_CONFIG,
	/** Import-specifier marker for DB-ORM schema imports (graph extractor). ORM-agnostic name —
	 *  today the ORM is Drizzle, but the marker is about WHERE the schema contract lives. */
	dbOrmSchemaSpecifier: `${scope}/contracts/db`,
	/** Per-language SDK package-name prefixes the graph/detectors key off. */
	sdkPackagePrefixes: {
		typescript: `${scope}/client`,
		go: `${LANG_CONFIG.go.modulePrefix}/client`,
		rust: `${LANG_CONFIG.rust.cratePrefix}-client`,
	},

	/** Env override for the monorepo root (graph CLI invoked from arbitrary cwds). */
	rootEnvVar: 'CODM_ROOT',

	// ── Layout — ALL DERIVED from WORKSPACES (the single source); do not add literals here ──
	workspaces: WORKSPACES,
	/** Source roots (repo-relative) — the prefixes review/graph tooling resolves against. */
	// ── STAMP-MANAGED: workspaceRoots — entry keys are WORKSPACES ids; create-template drops entries of dropped workspaces (a stamped manifest never roots a ghost workspace) ──
	workspaceRoots: {
		apiTs: WORKSPACES.apiTs.srcRoot,
		apiGo: WORKSPACES.apiGo.srcRoot,
		appReact: WORKSPACES.appReact.srcRoot,
		appAstro: WORKSPACES.appAstro.srcRoot,
	},
	// ── STAMP-MANAGED-END: workspaceRoots ──
	/** Package roots (repo-relative). The four *Dist/Gen entries are committed-generated OUTPUT paths
	 *  inside workspaces, not workspaces themselves. */
	// ── STAMP-MANAGED: packageRoots — entry keys are WORKSPACES ids or generated-output ids declared in GENERATED_OUTPUT_DEPS (scripts/create-template/plan.ts); create-template keeps an entry iff its workspace/deps are kept ──
	packageRoots: {
		contracts: WORKSPACES.contracts.pkgRoot,
		apiTs: WORKSPACES.apiTs.pkgRoot,
		apiGo: WORKSPACES.apiGo.pkgRoot,
		appReact: WORKSPACES.appReact.pkgRoot,
		appAstro: WORKSPACES.appAstro.pkgRoot,
		client: WORKSPACES.client.pkgRoot,
		clientTsDist: `${WORKSPACES.client.pkgRoot}/dist/typescript`,
		clientGoDist: `${WORKSPACES.client.pkgRoot}/dist/go`,
		contractsGenTs: `${WORKSPACES.contracts.pkgRoot}/generated/typescript`,
		contractsGenGo: `${WORKSPACES.contracts.pkgRoot}/generated/go`,
		e2e: WORKSPACES.e2e.pkgRoot,
		appTauri: WORKSPACES.appTauri.pkgRoot,
	},
	// ── STAMP-MANAGED-END: packageRoots ──
	/** Frontend selection aliases — derived from WORKSPACES (kind: frontend). */
	appTargets: Object.values(WORKSPACES)
		.filter(w => w.kind === 'frontend')
		.map(w => w.alias),

	/**
	 * ENV REGISTRY — the single declaration of every env key a fresh clone may set, with its
	 * CONSUMERS. The Zod schemas stay the RUNTIME truth for typing/coercion (core Config.ts for
	 * schema: 'kernel', src ProductConfig.ts for schema: 'product'; the Go backend's config.go
	 * mirrors the keys it consumes);
	 * this registry is the STRUCTURAL truth everything else derives from:
	 *   - `.env.example` is GENERATED from it (`bun env:generate`) — never hand-edited.
	 *   - `scripts/create-template.ts` keeps a key iff any KEPT workspace consumes it (set algebra
	 *     over `consumers` — no owner taxonomy).
	 *   - `tests/architecture/env-model.test.ts` gates PARITY: schema keys ↔ registry keys,
	 *     generated .env.example == committed, Go reads ⊆ declared. Drift = red build.
	 * CONTRACT (see EnvDecl): `consumers` is the DECLARED relation "which workspaces read this key"
	 * (workspace ids from WORKSPACES, plus 'compose' for docker interpolation) — evaluation is set
	 * algebra (a key ships iff any consumer ships), NEVER an if on a name/convention. `schema`
	 * (apiTs consumers only) says which Zod schema declares it: 'kernel' = core Config.ts,
	 * 'product' = src ProductConfig.ts. `group` is presentational (rendering section). Language is
	 * NOT a property of env keys — it lives on the workspace.
	 */
	// ── STAMP-MANAGED: env — create-template keeps a key iff at least one KEPT consumer remains (set algebra over `consumers`); the stamped .env.example is re-rendered from the pruned registry so `bun env:generate --check` stays green inside a stamp ──
	env: {
		// ── compose / identity ──
		PROJECT: {
			consumers: ['compose'],
			example: 'codm',
			doc: 'docker-compose prefix + Config.name (container naming only — there is no external database)',
		},
		SERVICE: { consumers: ['compose'], example: 'backend', doc: 'docker-compose container prefix (${PROJECT}-${SERVICE})' },
		NODE_ENV: { consumers: ['apiTs'], schema: 'kernel', example: 'development' },
		PRODUCT_NAME: {
			consumers: ['apiTs'],
			schema: 'product',
			example: 'Your Product',
			doc: 'brand rendered in transactional-email chrome (MailSender Layout header + footer)',
		},
		// ── ports ──
		API_PORT: { consumers: ['apiTs'], schema: 'kernel', example: '3030', doc: 'api-typescript' },
		API_GO_PORT: { consumers: ['apiGo'], example: '3032', doc: 'api-go' },
		VITE_PORT: {
			consumers: ['appReact'],
			example: '5173',
			doc: 'read by the e2e harness only — vite.config.ts hardcodes 5173; keep in sync',
		},
		// ── database / redis ──
		CODM_DATA_DIR: {
			consumers: ['apiTs', 'apiGo'],
			schema: 'kernel',
			example: '~/.codm/data',
			doc: 'shared data dir for the real daemon; ~ expands to $HOME. BOTH sidecars open the SAME codm.db here (api-go via modernc, api-ts via libsql; whatsmeow session tables live in the same file), and both run the same idempotent migration applier on boot in whatever order they start.',
		},
		REDIS_URL: { consumers: ['apiTs'], schema: 'kernel', example: 'redis://localhost:6379' },
		// ── Verbatim medscall channel service config (port b4530e2b) — CHANNEL_* primary keys with
		// generic fallbacks read by internal/shared/config/config.go. Retarget/rename happens in the
		// classification step; declared here so ENV-03 parity holds over the verbatim code.
		CHANNEL_PORT: { consumers: ['apiGo'], example: '3032', doc: 'gateway HTTP port (fallback: PORT)' },
		PORT: { consumers: ['apiGo'], example: '3030', doc: 'generic port fallback (TS honors it at runtime, outside the Config schema)' },
		CHANNEL_ALLOWED_ORIGINS: {
			consumers: ['apiGo'],
			example: 'http://localhost:5173',
			doc: 'gateway CORS allowlist (fallback: ALLOWED_ORIGINS)',
		},
		ALLOWED_ORIGINS: { consumers: ['apiGo'], example: 'http://localhost:5173', doc: 'generic CORS fallback' },
		CHANNEL_ENVIRONMENT: { consumers: ['apiGo'], example: 'DEVELOPMENT', doc: 'gateway environment (fallback: ENVIRONMENT)' },
		ENVIRONMENT: { consumers: ['apiGo'], example: 'DEVELOPMENT', doc: 'generic environment fallback' },
		CHANNEL_EVENT_GROUP_ID: { consumers: ['apiGo'], example: 'codm-gateway', doc: 'outbox source tag for the gateway' },
		CHANNEL_GLOBAL_API_KEY: {
			consumers: ['apiGo'],
			secret: true,
			example: '',
			doc: 'gateway HTTP apikey guard (TS proxy sends it server-side; fallback: GLOBAL_API_KEY)',
		},
		GLOBAL_API_KEY: { consumers: ['apiGo'], secret: true, example: '', doc: 'generic apikey fallback' },
		WHATSMEOW_LOG_LEVEL: { consumers: ['apiGo'], example: 'WARN', doc: 'whatsmeow client log level' },
		// NO `schema:` on purpose — ENV-05 requires one EXACTLY when apiTs is a consumer, and the TS
		// side reads this flag as raw process.env (src/shared/index.ts, src/boot.ts), outside
		// RawEnvSchema. Declared with apiGo as the consumer because config.go is where it is now read,
		// which is what puts it under the ENV-03 rail.
		CODM_E2E: {
			consumers: ['apiGo'],
			example: '',
			doc: 'test-only gateway ingress seam (internal/channel/testseam); refused under PRODUCTION',
		},
		// NO `schema:` on purpose — same ENV-05 dodge as CODM_E2E above, one step further: NO backend
		// declares 'apiTs' here at all (there is no Go reader to hang the declaration on instead), so
		// the registry consumer is 'compose' — the literal place this key is SET (docker/cloud.compose.yml
		// hard-overrides it to 'cloud' regardless of what the shared root .env says, so the local
		// daemon's own boot never sees it flip). Read as raw process.env.CODM_PROFILE in
		// src/index.ts / src/shared/cloud-profile.ts (SP2 Task T4), never through Config.env —
		// booting WITHOUT this var (the desktop daemon's default) is unchanged behavior.
		CODM_PROFILE: {
			consumers: ['compose'],
			example: '',
			doc: "cloud profile switch — 'cloud' boots only auth+owner (docker/cloud.compose.yml); unset boots the full desktop daemon",
		},
		RATE_LIMIT_DISABLED: {
			consumers: ['apiTs'],
			schema: 'kernel',
			example: 'false',
			doc: 'auth rate-limit escape hatch - the e2e runner sets true (per-IP windows break hermetic suites)',
			advanced: true,
		},
		// ── event partitioning ──
		API_EVENT_GROUP_ID: {
			consumers: ['apiTs'],
			schema: 'kernel',
			example: 'api-typescript',
			doc: 'outbox source tag consumed by api-typescript',
		},
		API_GO_EVENT_GROUP_ID: { consumers: ['apiGo'], example: 'api-go', doc: 'outbox source tag consumed by api-go' },
		// ── cross-service URLs ──
		API_URL: { consumers: ['apiTs', 'apiGo'], schema: 'kernel', example: 'http://localhost:3030', doc: 'api-typescript public URL' },
		API_GO_URL: {
			consumers: ['apiTs'],
			schema: 'kernel',
			example: 'http://localhost:3032',
			doc: 'api-go public URL (SDK aggregate client)',
		},
		APP_URL: {
			consumers: ['apiTs'],
			schema: 'kernel',
			example: 'http://localhost:5173',
			doc: 'app-web public URL (kernel reads it for redirects/urls)',
		},
		// ── auth / secrets ──
		BETTER_AUTH_SECRET: { consumers: ['apiTs'], schema: 'kernel', example: 'CHANGE_ME', secret: true },
		BETTER_AUTH_URL: { consumers: ['apiTs'], schema: 'kernel', example: 'http://localhost:3030/v1/authentication' },
		// Cloud profile only (SP2 Task T1/T4): social-provider credentials for the resurrected
		// better-auth instance (auth/services/Authentication/BetterAuth.ts), kernel-scoped like
		// BETTER_AUTH_SECRET/URL above — the auth bounded context ships in the base template, not a
		// per-product add-on. Empty defaults keep the LOCAL daemon profile (which never constructs
		// BetterAuth) booting without them.
		GITHUB_CLIENT_ID: { consumers: ['apiTs'], schema: 'kernel', example: '' },
		GITHUB_CLIENT_SECRET: { consumers: ['apiTs'], schema: 'kernel', example: '', secret: true },
		GOOGLE_CLIENT_ID: { consumers: ['apiTs'], schema: 'kernel', example: '' },
		GOOGLE_CLIENT_SECRET: { consumers: ['apiTs'], schema: 'kernel', example: '', secret: true },
		// Cloud profile's own public origin — better-auth's trustedOrigins/baseURL (distinct from
		// CORS_ALLOWED_ORIGINS, which governs the general API's cross-origin allowlist). Defaults to
		// API_URL when unset (core Config.ts cross-field default).
		CODM_CLOUD_URL: {
			consumers: ['apiTs'],
			schema: 'kernel',
			example: 'http://localhost:3030',
			doc: 'cloud profile public origin (better-auth baseURL/trustedOrigins); defaults to API_URL',
		},
		JWT_SECRET: {
			consumers: ['apiTs'],
			schema: 'kernel',
			example: 'CHANGE_ME',
			secret: true,
			doc: 'HMAC secret for signed tokens (e.g. invitation links)',
		},
		INTERNAL_SERVICE_KEY: {
			consumers: ['apiTs', 'apiGo'],
			schema: 'kernel',
			example: 'CHANGE_ME',
			secret: true,
			doc: 'Go→TS S2S header seam (x-internal-service-key)',
		},
		OPERATOR_API_KEY: {
			consumers: ['apiTs'],
			schema: 'kernel',
			example: '',
			secret: true,
			doc: 'operator endpoints (quota overrides); FAILS CLOSED when empty',
		},
		CREDENTIAL_VAULT_KEY: {
			consumers: ['apiTs'],
			schema: 'kernel',
			example: '',
			secret: true,
			doc: 'AES-256 seam for AesCredentialVault — unbound in the base; a product binding the vault re-adds it to REQUIRED_SECRETS_IN_PROD',
		},
		// ── cors / otel ──
		CORS_ALLOWED_ORIGINS: {
			consumers: ['apiTs', 'apiGo'],
			schema: 'kernel',
			example: '*',
			doc: "comma-separated; '*' for dev; all backends read this key",
		},
		OTEL_COLLECTOR_TRACE_URL: { consumers: ['apiTs'], schema: 'kernel', example: 'http://localhost:4317/v1/traces' },
		OTEL_COLLECTOR_LOG_URL: { consumers: ['apiTs'], schema: 'kernel', example: 'http://localhost:4317/v1/logs' },
		OTEL_SERVICE_NAME: {
			consumers: ['apiTs', 'apiGo'],
			schema: 'kernel',
			example: 'api-typescript',
			doc: 'per-service override; go sets its own',
		},
		// ── channel gateway (BC1, api-go) ──
		// (CODM_GATEWAY_API_KEY removed: its only consumers were the deleted per-endpoint ui
		// proxies. The gateway's own guard is CHANNEL_GLOBAL_API_KEY — empty/allow-all in proxied
		// deployments, since auth lives on the api-ts external/ChannelProxy hop.)
		// (WHATSMEOW_DATABASE_URL removed: whatsmeow's session tables now live in the
		// shared SQLite store, opened from CODM_DATA_DIR — there is no separate
		// database to point at. CHANNEL_SERVICE_NAME/SERVICE_NAME went with it: they
		// only ever drove the Postgres search_path.)
		// ── misc ──
		API_VERSION: { consumers: ['apiGo'], example: 'v1', doc: 'read by api-go; api-typescript reads VERSION (defaults ok in dev)' },
		// ── frontend (only VITE_* reach the browser) ──
		VITE_API_URL: { consumers: ['appReact'], example: 'http://localhost:3030' },
		SITE_URL: {
			consumers: ['appAstro'],
			example: '',
			doc: 'app-astro canonical origin (sitemap/RSS/canonical) at build time; MUST be set in production builds — empty falls back to http://localhost:4321',
		},
		// ── parked (documented, no active consumer) ──
		// SP2 pivoted the product to free/single-plan (.specs/2026-08-06-sp2-conta-oauth-design.md
		// Decision 1: "Gratuito, plano único, sem Stripe") — no billing bounded context, no webhook,
		// no checkout screen ships this SP. These test-mode keys already live in the founder's own
		// .env; declared here with `consumers: []` DELIBERATELY, so they are documented in
		// .env.example instead of silently undeclared, without implying any workspace currently
		// reads them. Re-add real `consumers`/`schema` if/when billing gets re-planned.
		STRIPE_SECRET_KEY: {
			consumers: [],
			group: 'parked',
			secret: true,
			example: '',
			doc: 'parked — no billing code ships this SP (Decision 1); test-mode key',
		},
		STRIPE_PUBLISHABLE_KEY: {
			consumers: [],
			group: 'parked',
			example: '',
			doc: 'parked — no billing code ships this SP (Decision 1); test-mode key',
		},
	},
	// ── STAMP-MANAGED-END: env ──
} as const

export type RepoConfig = typeof REPO
/** Who reads an env key: a workspace (by id) or the docker-compose interpolation layer. */
export type EnvConsumer = WorkspaceId | 'compose'
export interface EnvDecl {
	/** Declared relation: the workspaces that read this key. A stamped repo keeps the key iff at
	 *  least one consumer ships — pure set membership, no special cases. The ONE declared
	 *  exception is `group: 'parked'` (see below): a parked key carries `consumers: []` on
	 *  purpose (nothing reads it yet) and ships in EVERY stamp regardless — set membership over
	 *  an empty set is vacuously false, so "parked" is its own membership rule, not a consumer. */
	consumers: readonly EnvConsumer[]
	/** Which api-ts Zod schema declares the key (required iff 'apiTs' is a consumer). */
	schema?: 'kernel' | 'product'
	/** Grouping with TWO effects, both driven by this ONE declared field (never inferred from a
	 *  string convention elsewhere): (1) presentational — which `.env.example` section renders it
	 *  (`scripts/env/generate.ts` SECTIONS). (2) for `'parked'` ONLY — a set-algebra override read
	 *  by the create-template planner (`scripts/create-template/plan.ts`): a parked key (zero
	 *  active consumers, by design) ships in every stamp unconditionally, the same posture as the
	 *  literal `'compose'` consumer, instead of being silently pruned because no workspace
	 *  "consumes" it. `'billing-gateway'` is presentational-only. */
	group?: 'billing-gateway' | 'parked'
	example: string
	doc?: string
	secret?: boolean
	/** Tuning knob with a sane schema default — rendered commented-out in .env.example. */
	advanced?: boolean
}
