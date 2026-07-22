// Central configuration for the polyglot code-graph extractors.
//
// Workspaces are a matrix: every (role, lang) pair the graph cares about is a
// record below. Adapters iterate the matrix and filter by role/lang instead of
// hardcoding workspace paths.
//
// Anchor conventions (`entities`, `-components/`, etc.) remain in the
// per-language classifier — by design — because we still drive classification
// from folder layout, not tags.

import { join } from 'node:path'
import { REPO } from '../../../template.config'
import { ROOT } from './paths'

// Repo identity + layout flow from template.config.ts — never hardcode a
// scope/brand/package-path literal here (sync-machinery P1-2).
const PKG = REPO.packageRoots
const SRC = REPO.workspaceRoots

// ── Workspace matrix ─────────────────────────────────────────────────────────

export type WorkspaceRole = 'api' | 'app' | 'contracts' | 'client' | 'e2e'
export type WorkspaceLang = 'typescript' | 'go'

export interface Workspace {
	/** Stable identifier — used as a node-id prefix and CLI filter. */
	id: string
	role: WorkspaceRole
	lang: WorkspaceLang
	/** Workspace root, repo-relative (e.g. `packages/api/typescript`). */
	root: string
	/** Source root, repo-relative. */
	src: string
	/** ts-morph project root, when applicable. */
	tsconfig?: string
	/** OpenAPI spec path, repo-relative — set for `api` workspaces only. */
	openapi?: string
	/** Locale dir, repo-relative — set for frontends that ship i18n bundles. */
	locales?: string
	/** Generated code. Excluded from `build` unless --include-generated. */
	generated?: true
	/** Route discovery hint for frontends: anchor folder + file extensions. */
	routes?: { anchor: string; extensions: readonly string[] }
}

export const WORKSPACES: readonly Workspace[] = [
	// Contracts — the source of truth for wire types and DB schema.
	{
		id: 'contracts',
		role: 'contracts',
		lang: 'typescript',
		root: PKG.contracts,
		src: PKG.contracts,
		tsconfig: `${PKG.contracts}/tsconfig.json`,
	},

	// API backends.
	{
		id: 'api-typescript',
		role: 'api',
		lang: 'typescript',
		root: PKG.apiTs,
		src: SRC.apiTs,
		tsconfig: `${PKG.apiTs}/tsconfig.json`,
		openapi: `${PKG.apiTs}/public/docs/openapi.json`,
	},
	{
		id: 'api-go',
		role: 'api',
		lang: 'go',
		root: PKG.apiGo,
		src: SRC.apiGo,
		openapi: `${PKG.apiGo}/public/openapi.json`,
	},

	// Frontends.
	{
		id: 'app-react',
		role: 'app',
		lang: 'typescript',
		root: PKG.appReact,
		src: SRC.appReact,
		tsconfig: `${PKG.appReact}/tsconfig.json`,
		locales: `${SRC.appReact}/locales`,
		routes: { anchor: 'routes', extensions: ['.tsx', '.ts'] },
	},
	{
		id: 'app-expo',
		role: 'app',
		lang: 'typescript',
		root: PKG.appExpo,
		src: SRC.appExpo,
		tsconfig: `${PKG.appExpo}/tsconfig.json`,
		locales: `${PKG.appExpo}/locales`,
		routes: { anchor: 'app', extensions: ['.tsx', '.ts'] },
	},
	{
		id: 'app-astro',
		role: 'app',
		lang: 'typescript',
		root: PKG.appAstro,
		src: SRC.appAstro,
		tsconfig: `${PKG.appAstro}/tsconfig.json`,
		routes: { anchor: 'pages', extensions: ['.astro', '.tsx', '.ts'] },
	},

	// Generated SDK outputs.
	{
		id: 'client-typescript',
		role: 'client',
		lang: 'typescript',
		root: PKG.clientTsDist,
		src: `${PKG.clientTsDist}/src`,
		generated: true,
	},
	{
		id: 'client-go',
		role: 'client',
		lang: 'go',
		root: PKG.clientGoDist,
		src: PKG.clientGoDist,
		generated: true,
	},

	// Generated contracts outputs (wire + db emitted per language).
	{
		id: 'contracts-generated-ts',
		role: 'contracts',
		lang: 'typescript',
		root: PKG.contractsGenTs,
		src: `${PKG.contractsGenTs}/src`,
		generated: true,
	},
	{
		id: 'contracts-generated-go',
		role: 'contracts',
		lang: 'go',
		root: PKG.contractsGenGo,
		src: `${PKG.contractsGenGo}/wire`,
		generated: true,
	},

	// E2E.
	{
		id: 'e2e',
		role: 'e2e',
		lang: 'typescript',
		root: PKG.e2e,
		src: PKG.e2e,
	},
] as const

// ── Workspace lookup helpers ─────────────────────────────────────────────────

export function workspaceById(id: string): Workspace | undefined {
	return WORKSPACES.find(w => w.id === id)
}

export function workspacesByRole(role: WorkspaceRole): Workspace[] {
	return WORKSPACES.filter(w => w.role === role)
}

export function workspacesByLang(lang: WorkspaceLang): Workspace[] {
	return WORKSPACES.filter(w => w.lang === lang)
}

export function nonGeneratedWorkspaces(): Workspace[] {
	return WORKSPACES.filter(w => !w.generated)
}

/** Returns the workspace that owns `repoPath`, or undefined if none claims it. */
export function workspaceForFile(repoPath: string): Workspace | undefined {
	// Prefer the most specific (longest src prefix) match.
	let best: Workspace | undefined
	for (const w of WORKSPACES) {
		const prefix = `${w.src}/`
		if (repoPath.startsWith(prefix) || repoPath === w.src) {
			if (!best || w.src.length > best.src.length) best = w
		}
	}
	return best
}

// ── Special-case paths inside workspaces ─────────────────────────────────────

/** Drizzle schema directory (moved from api/src/shared/db to contracts). */
export const DRIZZLE_SCHEMA_DIR = `${PKG.contracts}/db/schema`

/** Import-specifier substring that identifies a Drizzle schema import. */
export const DRIZZLE_SCHEMA_IMPORT_MARKER = REPO.dbOrmSchemaSpecifier

/** Wire types directory (TypeSpec source). */
export const WIRE_ENUMS_DIR = `${PKG.contracts}/wire/enums`
export const WIRE_EVENTS_DIR = `${PKG.contracts}/wire/events`

// ── Source globs (derived from the workspace matrix) ─────────────────────────

const TS_LIKE = ['ts', 'tsx', 'mts', 'cts']

function workspaceTsGlobs(w: Workspace): string[] {
	return TS_LIKE.map(ext => `${w.src}/**/*.${ext}`)
}

function workspaceGoGlobs(w: Workspace): string[] {
	return [`${w.src}/**/*.go`]
}

/** All TS/TSX globs for backends + frontends (excludes generated by default). */
export function backendTypescriptGlobs(includeGenerated = false): string[] {
	return WORKSPACES.filter(w => w.role === 'api' && w.lang === 'typescript' && (includeGenerated || !w.generated)).flatMap(workspaceTsGlobs)
}

export function frontendGlobs(includeGenerated = false): string[] {
	const tsGlobs = WORKSPACES.filter(w => w.role === 'app' && (includeGenerated || !w.generated)).flatMap(workspaceTsGlobs)
	const localeGlobs = WORKSPACES.filter(w => w.role === 'app' && w.locales).map(w => `${w.locales}/*.json`)
	return [...tsGlobs, ...localeGlobs]
}

export function goGlobs(includeGenerated = false): string[] {
	return WORKSPACES.filter(w => w.lang === 'go' && (includeGenerated || !w.generated)).flatMap(workspaceGoGlobs)
}

// ── Boundary prefixes (legacy — derived from workspaces) ──────────────────────
// Some classifiers still use a single boundary string. Keep these as derived
// helpers until we finish per-workspace classifiers.

export const BACKEND_TS_BOUNDARY = SRC.apiTs
export const FRONTEND_REACT_BOUNDARY = SRC.appReact

// ── Ignore patterns ──────────────────────────────────────────────────────────

export const IGNORE_TS = [
	'**/node_modules/**',
	'**/dist/**',
	'**/.kubb/**',
	'**/*.test.ts',
	'**/*.test.tsx',
	'**/*.spec.ts',
	'**/*.spec.tsx',
]

export const IGNORE_GO = ['**/*_test.go', '**/vendor/**', '**/dist/**']

// ── External / framework libraries ───────────────────────────────────────────

export const EXTERNAL_JSX_MODULES: readonly string[] = [
	'@tabler/icons-react',
	'lucide-react',
	'react',
	'react-router',
	'@tanstack/react-router',
	'@tanstack/react-query',
	'@tanstack/react-form',
	'react-i18next',
	'sonner',
	'@radix-ui',
	'@base-ui-components',
	'@assistant-ui',
	'@ag-ui',
	'expo-router',
	'astro',
]

// ── SDK packages (per language) ──────────────────────────────────────────────
// The repo emits one SDK package per client language. The TS app imports
// `<scope>/client-*`; Go consumers import via their own build systems. The
// detector keys off the package name prefix — sourced from template.config.ts.

export const SDK_PACKAGES: Record<WorkspaceLang, string[]> = {
	typescript: [REPO.sdkPackagePrefixes.typescript],
	go: [REPO.sdkPackagePrefixes.go],
}

/** Pick the client workspace that an SDK import resolves to. */
export function clientWorkspaceForImport(spec: string, lang: WorkspaceLang): Workspace | undefined {
	const pkgs = SDK_PACKAGES[lang]
	if (!pkgs.some(p => spec.startsWith(p))) return undefined
	return WORKSPACES.find(w => w.role === 'client' && w.lang === lang)
}

// ── Go conventions ───────────────────────────────────────────────────────────

export const GO_MEDIATOR_SYMBOL = 'externalMediator.Publish'
export const GO_ERROR_CODE_PREFIX = 'Code'

// ── Locales ──────────────────────────────────────────────────────────────────

export const LOCALE_LANGS = ['pt', 'en'] as const
export type LocaleLang = (typeof LOCALE_LANGS)[number]

// ── Helpers ──────────────────────────────────────────────────────────────────

export function absFromRepo(repoPath: string): string {
	return join(ROOT, repoPath)
}

/** True when the given module specifier resolves to a generated SDK. */
export function isSdkSpecifier(spec: string, lang: WorkspaceLang = 'typescript'): boolean {
	return SDK_PACKAGES[lang].some(p => spec.startsWith(p))
}

/** True when an import specifier comes from a framework/library we don't own. */
export function isExternalJsxModule(spec: string): boolean {
	return EXTERNAL_JSX_MODULES.some(prefix => spec.startsWith(prefix))
}

// ── Internal compat (still used by classifier + frontend extractor) ──────────
// These are no longer cross-package exports — they exist so the TS classifier
// and frontend extractor can default to a sensible boundary when called
// without an explicit workspace. Removing them in a future pass requires
// switching those consumers to workspaceForFile() everywhere.

const _apiTs = WORKSPACES.find(w => w.id === 'api-typescript')!
const _appReact = WORKSPACES.find(w => w.id === 'app-react')!

export const BACKEND_GLOBS = backendTypescriptGlobs()
export const FRONTEND_GLOBS = frontendGlobs()
export const BACKEND_BOUNDARY = _apiTs.src
export const FRONTEND_BOUNDARY = _appReact.src

/**
 * Resolve an SDK module specifier to a flavor identifier. Returns the legacy
 * `app` flavor for the TS→TS pair (preserves existing `sdk:app:...` IDs) and
 * a polyglot `<sdkLang>:<backendLang>` tuple for everything else. The
 * frontend extractor only consumes this for TS app imports today.
 */
export function parseSdkFlavor(spec: string): string {
	if (spec.includes('/channel/app')) return 'channel-app'
	if (spec.includes('/channel/api')) return 'channel-api'
	if (spec.includes('/api')) return 'api'
	return 'app'
}
