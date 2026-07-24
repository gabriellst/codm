// template.config.ts — the ONE-file repo identity (Plan: .plans/2026-07-11-sync-machinery.md P1-1).
//
// Checked in per repo, NEVER synced by the sync train. Rebranding a fork
// (template → berzerk → medscall) is editing THIS file + regenerating
// (`bun sdk` / `bun contracts`) — never a codemod. Any generator, script, or
// tool that needs a brand value MUST read it from here; a literal is a bug.
//
// Deliberately dependency-free (plain const object, no imports) so ANY
// script/generator — bun scripts, eslint rule modules loaded via jiti,
// codegen under packages/ — can import it without dragging in a graph.
//
// Go cannot import this file. Go-side seams mirror individual values and name
// this file as their source of truth (see packages/api/go/core/pkg/openapi/walker.go
// `modulePrefix`). Keep them in lockstep when editing here.

const scope = '@codedm'
const brand = 'codedm'

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
} as const

const goModulePrefix = LANG_CONFIG.go.modulePrefix

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

/**
 * DESKTOP CONTRACT — the single declaration of the desktop shell (packages/app/tauri).
 * `scripts/desktop/generate.ts` renders tauri.conf.json + capabilities/default.json +
 * src-tauri/src/sidecars/generated.rs FROM this block (drift-gated: `bun desktop:generate --check`,
 * wired into test:tooling via scripts/desktop/generate.test.ts). `sidecars/build.ts` reads
 * it for binary names + build cwds. A literal in any of those files that exists here is a
 * bug — same rule as REPO.env.
 *
 * Boot-env value sources (`bootEnv`):
 *   { from: 'example' }        → REPO.env[key].example (generation-time literal)
 *   { from: 'dataDir' }        → the shell's runtime data dir (app_data_dir()/data) — Rust-side
 *   { from: 'desktopOrigins' } → `tauri://localhost,http://localhost:<VITE_PORT example>`
 *   { value: '...' }           → shell-decision literal (e.g. NODE_ENV=production)
 */
const DESKTOP = {
	/** OS-facing display name (window title, productName). The ONE place the cased brand
	 *  spelling lives — REPO.brand stays the lowercase token. */
	displayName: 'CodeDM',
	/** Reverse-DNS bundle identifier — derived from brand; ALSO the keychain service name
	 *  (generated.rs IDENTIFIER const). */
	identifier: `app.${brand}.desktop`,
	/** Genuine shell decisions — parameters with defaults, no repo-fact source. */
	window: { label: 'main', width: 1280, height: 800, minWidth: 980, minHeight: 640 },
	/** Console (webview content) wiring — which workspace renders inside the shell. */
	console: {
		workspace: 'appReact',
		/** Dev-server port key (REPO.env) + path the console mounts under in WEB dev (nitro on,
		 *  base '/app/'). This is the browser mount — NOT what the desktop webview loads. */
		devPortEnvKey: 'VITE_PORT',
		devPath: '/app/',
		/** Desktop dev: the nx target that serves the console as a root-based SPA
		 *  (`CODEDM_DESKTOP=true vite --host` → nitro OFF, base '/', VITE_PORT). Symmetric to
		 *  `buildTarget`'s build-spa. The shell's beforeDevCommand runs THIS, not `dev`. */
		devTarget: 'dev-spa',
		/** Base path the tauri webview loads in dev. The desktop SPA serves at root '/' (dev-spa /
		 *  build-spa set base '/'), so devUrl is the ROOT — not the web '/app/' mount. Declared
		 *  explicitly rather than derived, so the generator never hardcodes a convention. */
		devBasePath: '/',
		/** SPA output inside the console workspace (produced by `buildTarget`). */
		distSubpath: 'dist/client',
		buildTarget: 'build-spa',
		/** Sidecar roles the webview talks to DIRECTLY (CSP connect-src derives from this —
		 *  the gateway is reached through the daemon proxy, so it is not listed). */
		connectsTo: ['daemon'],
	},
	/** Supervised sidecars — one entry per subprocess the shell boots + health-checks.
	 *  binName renders as `<brand>-<role>`; ports/env resolve through REPO.env. */
	sidecars: [
		{
			workspace: 'apiTs',
			role: 'daemon',
			portEnvKey: 'API_PORT',
			/** Readiness probe — proves PGlite migrations ran and controllers registered. */
			healthPath: '/v1/session',
			build: { kind: 'bun-compile', entry: './src/index.ts' },
			bootEnv: {
				API_PORT: { from: 'example' },
				CODEDM_DATA_DIR: { from: 'dataDir' },
				// The Drizzle migrations directory. A `bun build --compile` binary has no node_modules
				// and the drizzle migrator reads the folder via node fs (which cannot walk `/$bunfs`),
				// so the migrations are STAGED as a bundle resource (build-sidecars copies them; the
				// shell resolves resource_dir/<subpath> at runtime) rather than embedded. Without this
				// the daemon dies in migrateEmbeddedDatabase before it ever listens.
				CODEDM_MIGRATIONS_DIR: { from: 'resourceDir', subpath: 'migrations' },
				API_GO_URL: { from: 'example' },
				NODE_ENV: { value: 'production' },
			},
		},
		{
			workspace: 'apiGo',
			role: 'gateway',
			portEnvKey: 'CHANNEL_PORT',
			/** The gateway's only doc/liveness route. */
			healthPath: '/api/openapi.json',
			build: { kind: 'go-build', entry: './cmd/api' },
			bootEnv: {
				CHANNEL_PORT: { from: 'example' },
				CODEDM_DATA_DIR: { from: 'dataDir' },
				CHANNEL_ALLOWED_ORIGINS: { from: 'desktopOrigins' },
			},
		},
	],
	/** Native capabilities the console consumes through the platform contract
	 *  (packages/app/react/src/services). ABSTRACT keys only — the capability → Tauri
	 *  permission map lives in the shell package (@codedm/app-tauri/capabilities,
	 *  CAPABILITY_PERMISSIONS); scripts/desktop/generate.ts maps these keys through it to
	 *  render capabilities/default.json. This contract never spells a Tauri permission. */
	capabilities: ['filePicker', 'notification', 'badge', 'secrets', 'autostart', 'hostInfo'],
} as const satisfies DesktopConfig

export interface DesktopConfig {
	displayName: string
	identifier: string
	window: { label: string; width: number; height: number; minWidth: number; minHeight: number }
	console: {
		workspace: WorkspaceId
		devPortEnvKey: string
		devPath: string
		devTarget: string
		devBasePath: string
		distSubpath: string
		buildTarget: string
		connectsTo: readonly string[]
	}
	sidecars: readonly SidecarDecl[]
	capabilities: readonly string[]
}
export interface SidecarDecl {
	/** The workspace this sidecar compiles from (cwd/entry resolve via WORKSPACES). */
	workspace: WorkspaceId
	/** Binary role suffix — binName = `<brand>-<role>`. */
	role: string
	/** REPO.env key holding the port this sidecar listens on (example = generation value). */
	portEnvKey: string
	healthPath: string
	build: { kind: 'bun-compile' | 'go-build'; entry: string }
	bootEnv: Readonly<Record<string, BootEnvSource>>
}
export type BootEnvSource =
	| { from: 'example' | 'dataDir' | 'desktopOrigins' }
	// A file/dir STAGED into the bundle's resource dir (build-sidecars copies it); the shell resolves
	// `resource_dir/<subpath>` at runtime. For assets a compiled binary can't inline (the migrations dir).
	| { from: 'resourceDir'; subpath: string }
	| { value: string }

export const REPO = {
	/** npm scope every workspace package lives under (`<scope>/core-typescript`, …). */
	scope,
	/** Human brand label (report titles, generated-doc headers). */
	brand,
	/** GitHub URL — eslint rule docs point here. */
	repoUrl: 'https://github.com/codedm/codedm',

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
		go: `${goModulePrefix}/client`,
	},

	/** Env override for the monorepo root (graph CLI invoked from arbitrary cwds). */
	rootEnvVar: 'CODEDM_ROOT',

	/** Desktop shell contract (see DESKTOP above) — the source scripts/desktop/generate.ts renders from. */
	desktop: DESKTOP,

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
		PROJECT: { consumers: ['compose'], example: 'codedm', doc: 'docker-compose prefix + Config.name; DATABASE_URL db name must match' },
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
		DATABASE_URL: {
			consumers: ['apiTs', 'apiGo'],
			schema: 'kernel',
			example: 'postgres://postgres:postgres@localhost:5432/codedm?sslmode=disable',
		},
		CODEDM_DATA_DIR: {
			consumers: ['apiTs', 'apiGo'],
			schema: 'kernel',
			example: '~/.codedm/data',
			doc: 'embedded file-backed PGlite data dir for the real daemon (migrations apply on boot); ~ expands to $HOME. api-go reads it as the gateway data-dir root.',
		},
		REDIS_URL: { consumers: ['apiTs', 'apiGo'], schema: 'kernel', example: 'redis://localhost:6379' },
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
		CHANNEL_EVENT_GROUP_ID: { consumers: ['apiGo'], example: 'codedm-gateway', doc: 'Redis consumer group for the gateway' },
		CHANNEL_SERVICE_NAME: { consumers: ['apiGo'], example: 'gateway', doc: 'service name for logs/traces (fallback: SERVICE_NAME)' },
		SERVICE_NAME: { consumers: ['apiGo'], example: 'gateway', doc: 'generic service-name fallback' },
		CHANNEL_GLOBAL_API_KEY: {
			consumers: ['apiGo'],
			secret: true,
			example: '',
			doc: 'gateway HTTP apikey guard (TS proxy sends it server-side; fallback: GLOBAL_API_KEY)',
		},
		GLOBAL_API_KEY: { consumers: ['apiGo'], secret: true, example: '', doc: 'generic apikey fallback' },
		WHATSMEOW_DATABASE_URL: {
			consumers: ['apiGo'],
			example: 'postgres://postgres:postgres@localhost:5432/codedm?sslmode=disable',
			doc: 'whatsmeow session store (empty falls back to DATABASE_URL)',
		},
		WHATSMEOW_LOG_LEVEL: { consumers: ['apiGo'], example: 'WARN', doc: 'whatsmeow client log level' },
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
		// (CODEDM_GATEWAY_API_KEY removed: its only consumers were the deleted per-endpoint ui
		// proxies. The gateway's own guard is CHANNEL_GLOBAL_API_KEY — empty/allow-all in proxied
		// deployments, since auth lives on the api-ts external/ChannelProxy hop.)
		// (CODEDM_GATEWAY_WHATSMEOW_URL removed: dead key — config.go reads
		// WHATSMEOW_DATABASE_URL; nothing ever consumed the CODEDM_* spelling.)
		// ── misc ──
		API_VERSION: { consumers: ['apiGo'], example: 'v1', doc: 'read by api-go; api-typescript reads VERSION (defaults ok in dev)' },
		// ── frontend (only VITE_* reach the browser) ──
		VITE_API_URL: { consumers: ['appReact'], example: 'http://localhost:3030' },
		SITE_URL: {
			consumers: ['appAstro'],
			example: '',
			doc: 'app-astro canonical origin (sitemap/RSS/canonical) at build time; MUST be set in production builds — empty falls back to http://localhost:4321',
		},
	},
	// ── STAMP-MANAGED-END: env ──
} as const

export type RepoConfig = typeof REPO
/** Who reads an env key: a workspace (by id) or the docker-compose interpolation layer. */
export type EnvConsumer = WorkspaceId | 'compose'
export interface EnvDecl {
	/** Declared relation: the workspaces that read this key. A stamped repo keeps the key iff at
	 *  least one consumer ships — pure set membership, no special cases. */
	consumers: readonly EnvConsumer[]
	/** Which api-ts Zod schema declares the key (required iff 'apiTs' is a consumer). */
	schema?: 'kernel' | 'product'
	/** Presentational grouping for .env.example sections (e.g. 'billing-gateway'). */
	group?: string
	example: string
	doc?: string
	secret?: boolean
	/** Tuning knob with a sane schema default — rendered commented-out in .env.example. */
	advanced?: boolean
}
