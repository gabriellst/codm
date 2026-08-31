// template.config.ts — the ONE-file repo identity (Plan: .plans/2026-07-11-sync-machinery.md P1-1).
//
// Checked in per repo, NEVER synced by the sync train. Rebranding a fork
// (ex.: template-fullstack → codm) is editing THIS file + regenerating
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
// A GRAFIA CASED da marca — o que o humano LÊ, contra o `brand` que o mecanismo USA.
//
// São fatos diferentes e por isso duas declarações: `brand` é minúsculo porque alimenta nome de
// pacote, chave de env e caminho; `brandDisplay` é o wordmark, e ninguém o deriva do outro (nem
// `toUpperCase()` nem capitalização acertariam "CoDM").
//
// Existia em TRÊS lugares, redigitado, e já tinha divergido: `tauri/config/window.ts` dizia "CODM"
// enquanto `app.ts` dizia "CoDM" — herança do rebrand de julho que o redesign de agosto corrigiu
// pela metade. Espelho sem rail não se mantém; agora há uma fonte e o `brand-display` rail a pina.
const brandDisplay = 'CoDM'

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
		// The DECLARED recipe for booting this workspace as a co-tenant of a test harness
		// (see TestBoot below). `-o api` is the path .gitignore already reserves for this
		// workspace's compiled binary ("Compiled Go binaries"); `run` names the same artifact,
		// and both resolve against `pkgRoot` — which is also what puts config.Load's
		// `godotenv.Load("../../../.env")` on the repo root, exactly like `bun dev:api:go`.
		testBoot: {
			build: ['go', 'build', '-o', 'api', './cmd/api'],
			run: ['./api'],
			// CODM_ENV picks the axis column (scripted mock ChannelFactory, no phone). The two apikey
			// keys are DECLARED EMPTY because a harness talks to the gateway DIRECTLY — there is no
			// api-ts proxy hop to stamp the key (`external/utils/forwardToChannel` does that in
			// production) — and because leaving them undeclared makes the boot depend on the caller's
			// cwd: MEASURED, `godotenv` (config.go) keeps an inline `#` comment as the VALUE when the
			// key is empty (`A=  # doc` parses to `"# doc"`, while `B=v  # doc` parses to `"v"`), so a
			// gateway launched from a cwd whose `.env` bun did not preload turns its guard ON with a
			// comment as the secret and answers 401 to everything. Both keys, because config.go's
			// fallback chain is CHANNEL_GLOBAL_API_KEY → GLOBAL_API_KEY.
			env: { CODM_ENV: 'e2e', CHANNEL_GLOBAL_API_KEY: '', GLOBAL_API_KEY: '' },
			binds: { port: 'CHANNEL_PORT', dataDir: 'CODM_DATA_DIR' },
			healthPath: '/api/health',
		},
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
	appUi: {
		pkgRoot: 'packages/app/ui',
		srcRoot: 'packages/app/ui/src',
		lang: 'react',
		kind: 'shared',
		alias: 'ui',
		nxProject: 'app-ui',
		devServer: null,
	},
	contracts: {
		pkgRoot: 'packages/contracts',
		srcRoot: 'packages/contracts/src',
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

/**
 * THE SLOTS a test harness can fill when it boots a workspace as a co-tenant — the CLOSED set of
 * facts only the harness knows (it picks the free port, it mints the scratch data dir). A recipe
 * declares which env var carries each slot; the harness never knows a service's env-var names,
 * and a service never knows the harness's port-picking. Growing this set is a contract change on
 * both sides, which is the point: a new slot cannot be smuggled in as a string convention.
 */
export type TestBootSlot = 'port' | 'dataDir'

/**
 * TEST-BOOT RECIPE — how a workspace boots as a SUBPROCESS co-tenant of another workspace's test
 * harness (spec .specs/2026-08-10-eixo-ambiente-go-design.md D9/AC-6; the consumer is
 * `startIntegrationBackend({ services })` in packages/api/typescript/tests/support/testing.ts).
 *
 * DECLARED, not inferred (CLAUDE.md Non-Negotiable §5): the harness resolves a service id to this
 * record by lookup and does exactly what it says — it never branches on `lang`, never guesses that
 * a Go service is built with `go build`, and never hardcodes a service name. A workspace WITHOUT a
 * recipe is simply not test-bootable, and asking for it is a typed error (see TestBootWorkspaceId).
 *
 * `build` and `run` are argv arrays (no shell, no quoting rules) resolved against the workspace's
 * `pkgRoot`. `build` runs at most ONCE per test process; `run` is spawned per boot.
 */
export interface TestBoot {
	/** argv, run in `pkgRoot`, at most once per test process, before the first spawn. */
	build: readonly string[]
	/** argv, run in `pkgRoot`, one process per harness boot. */
	run: readonly string[]
	/** Fixed env this recipe declares — the axis column the subprocess must boot in. */
	env: Readonly<Record<string, string>>
	/** Harness-provided slot → the env var it travels in. The whole binding, declared. */
	binds: Readonly<Record<TestBootSlot, string>>
	/** Path the harness polls (on the bound port) until the subprocess answers 2xx. */
	healthPath: string
}

/**
 * The workspaces that DECLARE a test-boot recipe — DERIVED from the table, never re-listed. This
 * is what types `startIntegrationBackend({ services })`, so asking for a workspace that has no
 * recipe is a compile error rather than a runtime surprise; in a stamped copy that dropped every
 * bootable workspace it collapses to `never`, and the harness call sites go red with it.
 */
export type TestBootWorkspaceId = {
	[K in WorkspaceId]: (typeof WORKSPACES)[K] extends { testBoot: TestBoot } ? K : never
}[WorkspaceId]

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
	/** How a test harness boots this workspace as a co-tenant subprocess (see TestBoot).
	 *  Absent = not test-bootable, which is the honest default for most workspaces. */
	testBoot?: TestBoot
}

export const REPO = {
	/** npm scope every workspace package lives under (`<scope>/core-typescript`, …). */
	scope,
	/** Human brand label (report titles, generated-doc headers). */
	brand,
	brandDisplay,
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
		appUi: WORKSPACES.appUi.pkgRoot,
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
			// `appTauri` porque o shell FORNECE o valor aos dois sidecars empacotados (config/env.ts →
			// shell-env.json). Sem ele, o app 0.5.3 saiu com o default `'Your Product'` como nome do
			// dispositivo vinculado no WhatsApp do cliente — o shell não encaminhava a chave.
			consumers: ['apiTs', 'apiGo', 'appTauri'],
			schema: 'product',
			example: 'codm',
			doc: 'brand: transactional-email chrome (MailSender Layout) AND the WhatsApp linked-device name the customer sees on their phone (core-go Config.ProductName)',
		},
		// ── ports ──
		API_PORT: {
			consumers: ['apiTs', 'appTauri'],
			schema: 'kernel',
			example: '3030',
			doc: 'api-typescript (o shell Tauri aponta o sub-cliente local para esta porta)',
		},
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
		// O NOME DO ARQUIVO DE STORE — env de PRODUTO, e é a chave que faz TS e Go concordarem (F3/T8).
		//
		// Ele estava literalizado em 10 lugares, dois deles em LINGUAGENS DIFERENTES que têm de casar
		// byte a byte (`src/shared/db/FileLibsqlDriver.ts` e `go/core/db/sqlite/store.go` — os comentários
		// dos dois admitiam serem espelhos um do outro). Num rebrand pela metade, o TS abria um banco e o
		// Go abria outro, em silêncio, sobre o mesmo data dir.
		//
		// Env e não constante de manifesto: o Go NÃO importa este arquivo (e o Dockerfile nem o copia),
		// mas os dois lados leem env nativamente — então a env é o único canal que os alcança sem
		// espelho. Setá-la uma vez no `.env` move os dois juntos, que é a propriedade que faltava.
		// A TAG DE MENÇÃO de último recurso — o que o operador digita no WhatsApp quando o basename do
		// workspace não produz slug nenhum (caminho raiz, nome só com ideogramas).
		//
		// Env de PRODUTO porque é a MARCA falando com o usuário final, e um fork que não a trocasse
		// responderia por um nome que não é dele. Não é kernel: um core portável não tem tag de menção.
		CODM_MENTION_FALLBACK_TAG: {
			consumers: ['apiTs'],
			schema: 'product',
			example: 'codm',
			doc: 'tag de menção usada quando o nome da pasta do workspace não gera slug',
			advanced: true,
		},
		CODM_DB_FILE_NAME: {
			consumers: ['apiTs', 'apiGo'],
			schema: 'product',
			example: 'codm.db',
			doc: 'nome do arquivo SQLite dentro do CODM_DATA_DIR, lido por AMBOS os sidecars; um rebrand troca isto e os dois seguem juntos',
			advanced: true,
		},
		// O INTERPRETADOR DE LOTE DO WINDOWS — o único executável capaz de rodar o `claude.cmd` que o
		// npm instala (`agent/services/AgentRunner/platformInvocation.ts`).
		//
		// `advanced` porque NINGUÉM preenche esta linha: o Windows já exporta a variável em toda
		// sessão, e fora do Windows ela não existe. Está declarada porque o rail process-env exige que
		// toda leitura de ambiente do `src/` entre pela porta tipada — inclusive a de um valor que o
		// próprio SO anuncia. Maiúscula, e não o `ComSpec` que o Windows escreve: lá `process.env` é
		// insensível a caixa, então uma chave só alcança o valor.
		COMSPEC: {
			consumers: ['apiTs'],
			schema: 'kernel',
			example: 'C:\\Windows\\System32\\cmd.exe',
			doc: 'interpretador de lote do Windows; o SO já o exporta — declarado para o platformInvocation ler pela porta tipada',
			advanced: true,
		},
		// O PATH HERDADO PELO DAEMON — mesmo racional do COMSPEC: o SO define, ninguém preenche, mas a
		// leitura entra pela porta tipada. É a BASE do PATH que `resolveProviderEnv` monta para os
		// processos-filho (CLI do provedor): um .app lançado pelo Finder/launchd herda quase nada, e o
		// shebang `#!/usr/bin/env node` do CLI morre com 127 se o filho receber esse PATH cru.
		PATH: {
			consumers: ['apiTs'],
			schema: 'kernel',
			example: '/usr/local/bin:/usr/bin:/bin',
			doc: 'PATH herdado pelo daemon; o SO define — declarado como base do PATH dos processos-filho (resolveProviderEnv)',
			advanced: true,
		},
		REDIS_URL: { consumers: ['apiTs'], schema: 'kernel', example: 'redis://localhost:6379' },
		// ── Config verbatim do serviço de canal de origem — CHANNEL_* primary keys with
		// generic fallbacks read by internal/shared/config/config.go. Retarget/rename happens in the
		// classification step; declared here so ENV-03 parity holds over the verbatim code.
		CHANNEL_PORT: {
			consumers: ['apiGo', 'appTauri'],
			example: '3032',
			doc: 'gateway HTTP port (fallback: PORT); o shell Tauri aponta o sub-cliente `go` para ela',
		},
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
		// schema: 'kernel' (eixo-único-de-ambiente T1): CODM_PROFILE joined RawEnvSchema, so
		// `Config.env.CODM_PROFILE` is now the typed read — the raw `process.env.CODM_PROFILE`
		// call sites in src/index.ts / src/shared/cloud-profile.ts sweep to it in T5 (process.env
		// exclusive-to-Config rail; previously this key was deliberately kept schema: 'raw' to
		// dodge a Config.ts entry). The value is BAKED as ENV in docker/cloud.Dockerfile — the
		// deploy surface is Railway (compose aposentado, decisão do founder 2026-08-07).
		// Injetada pelo SHELL em cada sidecar (packages/app/tauri/src-tauri/src/sidecars/mod.rs): a
		// versão do bundle instalado. Lida como process.env cru na linha "Sobre" das configurações —
		// daí schema 'raw'. Ausente no `bun dev`, onde o fallback é o package.json do workspace.
		CODM_APP_VERSION: {
			consumers: ['apiTs'],
			schema: 'raw',
			example: '',
			doc: 'versão do bundle desktop, injetada pelo shell nos sidecars',
		},
		CODM_PROFILE: {
			consumers: ['apiTs'],
			schema: 'kernel',
			example: '',
			doc: "cloud profile switch — 'cloud' boots only auth+owner (baked as ENV in docker/cloud.Dockerfile; Railway-only deploy, compose aposentado 2026-08-07); unset boots the full desktop daemon",
		},
		// Eixo-único-de-ambiente (spec Decision 7, T1) + eixo-ambiente-go (spec Decision 2): the SAME
		// var and column names both backends select their environment axis by. `index.ts` repasses it
		// as `start({ env: Config.env.CODM_ENV })` on the TS side; `core/registry.App(cfg.Env, base,
		// overlays)` composes by it on the Go side (core/config/config.go: `registry.ParseEnv`).
		// TS: `mock`/`integration` stay programmatic-only (TestBed/harness), never this var — only
		// `real`/`e2e` are read from it. Go has no TestBed layer, so `integration`/`e2e` are ALSO
		// selected by this var there (Go-internal tests read it directly too).
		CODM_ENV: {
			consumers: ['apiTs', 'apiGo'],
			schema: 'kernel',
			example: 'real',
			doc: "boot environment selector — 'real' (default), 'integration', or 'e2e'; TS only reads this var for 'real'/'e2e' (mock/integration are programmatic-only there); apiGo (no TestBed layer) reads it for all three",
		},
		// Modo de emissão de OpenAPI (bun sdk / emit-openapi project.json target): sob 'true' o boot
		// só coleta rotas para gerar o spec, sem tocar persistência real nem enfileirar jobs/comandos.
		EMIT_OPENAPI: {
			consumers: ['apiTs'],
			schema: 'kernel',
			example: '',
			doc: 'openapi emission mode — set by the emit-openapi nx target; boot collects routes only',
		},
		// Companion to EMIT_OPENAPI (T5): under emission the boot exits right after writing the spec
		// unless this is 'true'. The emit-openapi nx target sets it 'false' explicitly (project.json).
		START_SERVER: {
			consumers: ['apiTs'],
			schema: 'kernel',
			example: '',
			doc: "under EMIT_OPENAPI=true, 'true' keeps serving after the spec is written instead of exiting",
			advanced: true,
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
		BETTER_AUTH_URL: { consumers: ['apiTs'], schema: 'kernel', example: 'http://localhost:3030/authentication' },
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
		// O Postgres do deployment de NUVEM (ADR 0005) — um BANCO próprio, não um servidor próprio.
		// Nada aqui provisiona container: o dev aponta para o Postgres que já roda na máquina e cria
		// `codm_cloud` ao lado dos outros, que é como os repos vizinhos convivem hoje.
		//
		// SEM default embutido, de propósito: um `postgres://localhost/...` implícito apontaria para
		// QUALQUER banco que exista ali, que é a forma mais barata de escrever no banco errado.
		// Faltando sob `CODM_PROFILE=cloud`, o `PgDriver` recusa nascer com
		// `MISSING_ENVIRONMENT_VARIABLE`.
		CLOUD_DATABASE_URL: {
			consumers: ['apiTs'],
			schema: 'kernel',
			example: 'postgres://postgres:postgres@localhost:5432/codm_cloud',
			doc: 'cloud deployment Postgres DATABASE (own db on the machine\u2019s existing server); read by PgDriver under CODM_PROFILE=cloud',
		},
		CODM_CLOUD_URL: {
			consumers: ['apiTs', 'appTauri'],
			schema: 'kernel',
			// :3033 = o processo `bun dev:cloud`, NÃO :3030. O daemon local não monta `auth` (ele é
			// cloud-only na PLACEMENT), então apontar para si mesmo é o beco sem saída que o docblock de
			// `app/react/src/lib/config.ts` já documenta ter custado um login quebrado em 2026-08-07.
			//
			// 3033 e não 3031 porque a família de portas daqui é 3030 (api) · 3032 (gateway) · 3033
			// (nuvem): 3031 já é de outro projeto nesta máquina, e brigar por ela dá um bind falho que
			// parece defeito nosso.
			example: 'http://localhost:3033',
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
		// (API_VERSION/VERSION saíram com o prefixo de versão do roteador: nada no gateway Go lia a
		// primeira, e a segunda só alimentava o `Config.version` que o MainRouter prefixava às rotas.)
		// No frame for this long ⇒ ClaudeAgentRunner treats the run as wedged and kills it (§4.3 rule
		// 5 backstop). T5: previously read raw (`process.env.CODM_AGENT_INACTIVITY_MS ?? 180_000`).
		CODM_AGENT_INACTIVITY_MS: {
			consumers: ['apiTs'],
			schema: 'product',
			example: '180000',
			doc: 'ClaudeAgentRunner inactivity watchdog backstop, ms',
			advanced: true,
		},
		// ── frontend (only VITE_* reach the browser) ──
		VITE_API_URL: { consumers: ['appReact'], example: 'http://localhost:3030' },
		// The desktop console's OWN VITE_-mirrored twin of CODM_CLOUD_URL (SP2 Task T6): the browser
		// the console opens for OAuth sign-in, and the base URL for the exchange/revoke device-token
		// calls, must hit the CLOUD deployment (Railway in prod) — a DIFFERENT origin than the local
		// daemon's own VITE_API_URL once the two are deployed separately, even though both default to
		// the same localhost:3030 in dev (CODM_CLOUD_URL falls back to API_URL there too). Defaults to
		// VITE_API_URL when unset (Config.cloudUrl, src/lib/config.ts) so a fresh .env keeps working.
		// Telemetria de PRODUTO (SP4). A chave de ingest do PostHog é pública por desenho — vai
		// dentro do binário e do bundle da landing, e o rate limit mora do lado deles; por isso é
		// repo VARIABLE nos workflows, nunca secret. Consumida pelas duas superfícies web; o daemon
		// NÃO fala com o PostHog (uso real acontece com o console fechado — essa metade é OTel).
		VITE_POSTHOG_KEY: {
			consumers: ['appReact', 'appAstro'],
			example: '',
			doc: 'chave de ingest do PostHog (pública); vazia desliga a telemetria de produto',
		},
		VITE_POSTHOG_HOST: {
			consumers: ['appReact', 'appAstro'],
			example: 'https://us.i.posthog.com',
			doc: 'host do PostHog — US cloud (decisão do founder, 2026-08-07); a região é imutável na criação da conta',
		},
		VITE_CODM_CLOUD_URL: {
			consumers: ['appReact'],
			// :3033 — o gêmeo de browser da chave acima. Ver o comentário lá.
			example: 'http://localhost:3033',
			doc: 'cloud profile public origin the desktop console opens for OAuth sign-in (mirrors CODM_CLOUD_URL for the browser; defaults to VITE_API_URL)',
		},
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
	 *  least one consumer ships — pure set membership, no special cases. The ONE declared
	 *  exception is `group: 'parked'` (see below): a parked key carries `consumers: []` on
	 *  purpose (nothing reads it yet) and ships in EVERY stamp regardless — set membership over
	 *  an empty set is vacuously false, so "parked" is its own membership rule, not a consumer. */
	consumers: readonly EnvConsumer[]
	/** Which api-ts Zod schema declares the key (required iff 'apiTs' is a consumer). */
	schema?: 'kernel' | 'product' | 'raw'
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
