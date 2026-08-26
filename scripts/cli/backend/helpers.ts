// Shared helpers used by backend templates, the backendGenerators dispatch table,
// and the full-context bootstrapper.

import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { REPO } from '../../../template.config'

export const ROOT = process.cwd()

// ─── Multi-language layout ───────────────────────────────────────────
//
// The polyglot template hosts two backends side-by-side (template.config.ts
// REPO.workspaces — language is a workspace property). Per-context layouts:
//
//   typescript → packages/api/typescript/src/<ctx>/<folder>/...
//   go         → packages/api/go/internal/<ctx>/<folder>/...
//
// The CLI scaffolder dispatches by `--lang` (default: typescript).

export type BackendLang = 'typescript' | 'go'

export const SUPPORTED_LANGS: readonly BackendLang[] = ['typescript', 'go']

/**
 * Declares, per backend language, whether `bun cli` has a wired-up scaffolder — the single
 * source of truth for "go generator NOT YET implemented". Two consumers derive from this map
 * instead of re-declaring the claim as prose/hardcode:
 *   - `scripts/cli.ts`'s `--help` banner (BACKEND LANG SUPPORT block)
 *   - PR-27 (`scripts/graph/cli/validate-plan-cmd.ts`) — exempts scaffoldable artifacts in a
 *     language with no generator from the "must have a `bun cli <verb>` step" requirement,
 *     via `hasGenerator()` below, never an `if (lang === 'go')` in the rule itself.
 * Flip a value here once a language's generator ships end-to-end — both derived surfaces and
 * the PR-27 exemption follow automatically.
 */
export const GENERATOR_SUPPORT: Record<BackendLang, boolean> = {
	typescript: true,
	go: false,
}

/**
 * Whether `bun cli` can scaffold artifacts in `lang` today. Keyed off `GENERATOR_SUPPORT` for
 * the two backend languages; any other `SkillLang` (react/astro/rust — not a `bun cli --lang`
 * target) is treated as supported by default, so PR-27 only exempts on an explicit `false`.
 */
export function hasGenerator(lang: string): boolean {
	return GENERATOR_SUPPORT[lang as BackendLang] ?? true
}

/** Commands that require an existing bounded context as their first positional. */
export const backendContextCommands = [
	'entity',
	'value-object',
	'usecase',
	'controller',
	'handler',
	'service',
	'event',
	'middleware',
	'enum',
	'repository',
	'schema',
	'errors',
	'projection',
	'projector',
] as const

// Src roots flow from the workspace table (sync-machinery P1-2). Derived by lookup over the
// DECLARED backends so a stamped copy whose manifest dropped a backend still imports cleanly —
// language is a workspace property, and absence of a language is a valid selection.
const PER_LANG_API_ROOT: Partial<Record<BackendLang, string>> = Object.fromEntries(
	Object.values(REPO.workspaces)
		.filter(w => w.kind === 'backend')
		.map(w => [w.lang, join(ROOT, w.srcRoot)]),
)

/** File-system root for a given language's bounded contexts. */
export function apiRoot(lang: BackendLang): string {
	const root = PER_LANG_API_ROOT[lang]
	if (root === undefined) {
		console.error(`No ${lang} backend workspace declared in template.config.ts (REPO.workspaces).`)
		process.exit(1)
	}
	return root
}

/**
 * Resolve the target language:
 *   1. explicit --lang flag wins
 *   2. otherwise infer from cwd (if user is `cd`'d into a package)
 *   3. default to `typescript`
 */
export function resolveLang(flagValue: string | undefined, cwd = process.cwd()): BackendLang {
	if (flagValue) {
		const normalized = flagValue.toLowerCase()
		// Accept both spelled-out and short forms
		if (normalized === 'typescript' || normalized === 'ts') return 'typescript'
		if (normalized === 'go') return 'go'
		console.error(`Unknown --lang value: "${flagValue}". Expected: typescript | go`)
		process.exit(1)
	}
	if (cwd.includes('/packages/api/go')) return 'go'
	if (cwd.includes('/packages/api/typescript')) return 'typescript'
	return 'typescript'
}

/**
 * Public-facing API_SRC kept as the typescript root for backwards compatibility
 * with existing templates and the context bootstrapper. Future per-language
 * scaffolders should call `apiRoot(lang)` instead. Falls back to '' in a stamp
 * without a typescript backend — consumers reach it only via typescript flows.
 */
export const API_SRC = PER_LANG_API_ROOT.typescript ?? ''

// --- Naming ---

export const toPascalCase = (str: string): string => str.charAt(0).toUpperCase() + str.slice(1)

/** `ClassifyIssue` / `classify-issue` / `classify_issue` → `CLASSIFY_ISSUE` — the enum-member spelling. */
export const toScreamingSnakeCase = (str: string): string =>
	str
		.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
		.replace(/[-\s]+/g, '_')
		.toUpperCase()
export const toCamelCase = (str: string): string => str.charAt(0).toLowerCase() + str.slice(1)
export const toKebabCase = (str: string): string => str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()

export const toVerbEntityFormat = (str: string): string => {
	const words = str.split(/(?=[A-Z])/).map(word => word.toLowerCase())
	return words.join('_')
}

// --- HTTP ---

export const VALID_HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'ws', 'sse'] as const
export type ValidHttpMethod = (typeof VALID_HTTP_METHODS)[number]

export function validateHttpMethod(method: string): ValidHttpMethod {
	const lowerMethod = method.toLowerCase()
	if (!VALID_HTTP_METHODS.includes(lowerMethod as any)) {
		console.error(`Invalid HTTP method: "${method}". Valid: ${VALID_HTTP_METHODS.join(', ')}`)
		process.exit(1)
	}
	return lowerMethod as ValidHttpMethod
}

export function validatePath(path: string): string {
	if (!path.startsWith('/')) {
		console.error(`Invalid path: "${path}". Must start with "/"`)
		process.exit(1)
	}
	return path
}

export function inferHttpMethod(controllerName: string): ValidHttpMethod {
	const lower = controllerName.toLowerCase()
	if (lower.startsWith('create')) return 'post'
	if (lower.startsWith('update')) return 'put'
	if (lower.startsWith('delete') || lower.startsWith('remove')) return 'delete'
	if (lower.startsWith('get')) return 'get'
	if (lower.startsWith('list') || lower.startsWith('fetch')) return 'get'
	if (lower.startsWith('patch')) return 'patch'
	return 'post'
}

export function inferPath(controllerName: string, contextName: string, isInternal: boolean): string {
	const lower = controllerName.toLowerCase()
	const prefix = isInternal ? '/internal' : '/'
	const kebab = toKebabCase(contextName)
	const plural = kebab.endsWith('s') ? kebab : `${kebab}s`

	const buildPath = (withId = false) => {
		const base = prefix === '/' ? `/${plural}` : `${prefix}/${plural}`
		return withId ? `${base}/:id` : base
	}

	if (lower.startsWith('create') || lower.startsWith('list') || lower.startsWith('fetch')) return buildPath(false)
	if (lower.startsWith('update') || lower.startsWith('delete') || lower.startsWith('get')) return buildPath(true)
	return buildPath(false)
}

// --- Argument validation / filesystem ---

export function requireArg(val: string | undefined, usage: string): asserts val is string {
	if (!val) {
		console.error(`Usage: ${usage}`)
		process.exit(1)
	}
}

export async function contextExists(contextName: string, lang: BackendLang = 'typescript'): Promise<boolean> {
	try {
		await access(join(apiRoot(lang), contextName))
		return true
	} catch {
		return false
	}
}
