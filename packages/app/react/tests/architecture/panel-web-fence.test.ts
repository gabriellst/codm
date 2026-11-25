import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

/**
 * RAIL — the cloud panel's bundle carries nothing of the desktop (spec `.specs/2026-11-24-tarefa-e-painel-
 * design.md` §6(a), review C1).
 *
 * The panel (`src/panel/web/main.tsx`) is a PUBLIC page: anyone with a group's link loads it. It shares the
 * task conversation and the kanban card with the desktop, and that shared code sits one careless import away
 * from the desktop's barrels — `@/hooks` re-exports `useServerEvents` and the analytics hooks, `@/lib`
 * re-exports the better-auth client and `config` (`VITE_API_URL`), `@/stores` the cloud-session store. A rail
 * that only looked at `src/panel/**` would stay green while the bundle shipped all of that, so this one walks
 * the IMPORT CLOSURE from the entry (resolving `@/` → `src/`, relative paths, `.ts`/`.tsx`/`index` and
 * dynamic `import()`), and fails on any module that is the desktop's alone — however indirectly it was
 * reached. It also fails on any `dangerouslySetInnerHTML` in the closure: every value the panel shows was
 * written by people in a chat, and it is rendered as text, never as markup.
 *
 * `import type` / `export type` statements are skipped: they are erased by the build and ship nothing.
 * Package imports end the walk (they are recorded; `posthog-js` among them is a failure too).
 *
 * The negative fixture (`fixtures/panel-fence/`) proves the walk is transitive: its entry reaches a
 * forbidden module only through two plain relative hops, and the rail names it.
 */

const APP_ROOT = resolve(import.meta.dir, '..', '..')
const SRC = join(APP_ROOT, 'src')
const ENTRY = join(SRC, 'panel', 'web', 'main.tsx')
const FIXTURE_SRC = join(import.meta.dir, 'fixtures', 'panel-fence', 'src')

interface Closure {
	/** Every source file reached, relative to the src root. */
	files: string[]
	/** Every bare (package) specifier met on the way. */
	packages: Set<string>
	/** Relative/alias specifiers that resolved to nothing — a broken walk must not pass silently. */
	unresolved: string[]
	/** Who imported each file first — to explain a violation. */
	parentOf: Map<string, string>
}

const PARSED = /\.(ts|tsx)$/
const CANDIDATE_SUFFIXES = ['', '.ts', '.tsx', '/index.ts', '/index.tsx']

/** Comments out — a docblock that mentions `import x from '@/routes'` is prose, not wiring. */
function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/** The module specifiers a file really loads (static, re-export, side-effect, dynamic) — never type-only ones. */
export function specifiersOf(source: string): string[] {
	const code = stripComments(source)
	const out: string[] = []
	// The clause between the keyword and `from` never holds `=` or `(` — so a type ALIAS (`export type X = …`) or a
	// declaration cannot be swallowed together with a later real re-export and skipped as "type-only".
	const statements = /(?:^|[;\n])\s*(import|export)\s+(type\s+)?([^'"`;=()]*?)\s*from\s*['"]([^'"]+)['"]/g
	for (const match of code.matchAll(statements)) if (!match[2]) out.push(match[4] as string)
	for (const match of code.matchAll(/(?:^|[;\n])\s*import\s*['"]([^'"]+)['"]/g)) out.push(match[1] as string)
	for (const match of code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(match[1] as string)
	return out
}

function resolveFile(base: string): string | undefined {
	for (const suffix of CANDIDATE_SUFFIXES) {
		const candidate = `${base}${suffix}`
		if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
	}
	return undefined
}

/** The import closure of `entry`, `@/` resolving against `srcRoot`. */
export function closure(entry: string, srcRoot: string): Closure {
	const seen = new Set<string>()
	const packages = new Set<string>()
	const unresolved: string[] = []
	const parentOf = new Map<string, string>()
	const queue = [entry]
	while (queue.length > 0) {
		const file = queue.shift() as string
		if (seen.has(file)) continue
		seen.add(file)
		if (!PARSED.test(file)) continue // css / json: reached, not parsed
		for (const specifier of specifiersOf(readFileSync(file, 'utf8'))) {
			const local = specifier.startsWith('@/') || specifier.startsWith('.')
			if (!local) {
				packages.add(specifier)
				continue
			}
			const base = specifier.startsWith('@/') ? join(srcRoot, specifier.slice(2)) : resolve(dirname(file), specifier)
			const target = resolveFile(base)
			if (!target) {
				unresolved.push(`${relative(srcRoot, file)} → ${specifier}`)
				continue
			}
			if (!parentOf.has(target)) parentOf.set(target, file)
			queue.push(target)
		}
	}
	const rel = (path: string) => relative(srcRoot, path).split('\\').join('/')
	return {
		files: [...seen].map(rel).sort(),
		packages,
		unresolved,
		parentOf: new Map([...parentOf].map(([child, parent]) => [rel(child), rel(parent)])),
	}
}

/** The desktop-only modules, each with why it may not reach a public page. */
const FORBIDDEN: { why: string; test: (file: string) => boolean }[] = [
	{ why: 'a desktop route (router, loopback, title bar)', test: f => f.startsWith('routes/') },
	{ why: 'the desktop DI registry (Tauri / browser services)', test: f => f.startsWith('services/registry') },
	{ why: 'the @/hooks barrel (useServerEvents, analytics, cloud logout)', test: f => f === 'hooks/index.ts' },
	{ why: 'the @/lib barrel (auth client, config, errors → stores)', test: f => f === 'lib/index.ts' },
	{ why: 'VITE_API_URL config of the desktop', test: f => f === 'lib/config.ts' },
	{ why: 'the better-auth client', test: f => /^lib\/auth/.test(f) },
	{ why: 'a desktop store (only the dialog store is shared)', test: f => f.startsWith('stores/') && f !== 'stores/useDialogStore.tsx' },
	{ why: 'the owner SSE stream', test: f => /useServerEvent/.test(f) },
	{ why: 'the desktop services provider', test: f => /ServicesProvider/.test(f) },
	{ why: 'analytics / PostHog', test: f => /posthog|analytics/i.test(f) },
]
const FORBIDDEN_PACKAGES = ['posthog-js']

function violations(c: Closure): string[] {
	const out: string[] = []
	for (const file of c.files) {
		const rule = FORBIDDEN.find(r => r.test(file))
		if (rule) out.push(`${file} (${rule.why}) — reached from ${c.parentOf.get(file) ?? '?'}`)
	}
	for (const pkg of FORBIDDEN_PACKAGES) if (c.packages.has(pkg)) out.push(`package ${pkg}`)
	return out
}

function markupSinks(c: Closure, srcRoot: string): string[] {
	return c.files.filter(file => PARSED.test(file) && readFileSync(join(srcRoot, file), 'utf8').includes('dangerouslySetInnerHTML'))
}

describe('rail: the cloud panel bundle carries nothing of the desktop', () => {
	const real = closure(ENTRY, SRC)

	it('the walk reaches the shared task code (it is not passing by finding nothing)', () => {
		expect(real.unresolved).toEqual([])
		expect(real.files).toContain('panel/web/main.tsx')
		expect(real.files.some(f => f.startsWith('components/task/'))).toBe(true)
	})

	it('no desktop-only module is in the closure of src/panel/web/main.tsx', () => {
		expect(violations(real)).toEqual([])
	})

	it('no file in the closure renders markup from data (dangerouslySetInnerHTML)', () => {
		expect(markupSinks(real, SRC)).toEqual([])
	})

	it('negative fixture: an INDIRECT import of a forbidden module is caught, and so is a markup sink', () => {
		const fixture = closure(join(FIXTURE_SRC, 'panel', 'web', 'main.tsx'), FIXTURE_SRC)
		expect(fixture.unresolved).toEqual([])
		// main.tsx → ../Feature → ../lib/helper → @/lib/config: two relative hops before the forbidden one.
		expect(violations(fixture)).toEqual(['lib/config.ts (VITE_API_URL config of the desktop) — reached from lib/helper.ts'])
		expect(markupSinks(fixture, FIXTURE_SRC)).toEqual(['panel/Feature.tsx'])
	})

	it('type-only imports ship nothing and are not followed', () => {
		expect(specifiersOf("import type { X } from '@/routes/a'\nexport type { Y } from '@/lib'\nimport { z } from './z'")).toEqual(['./z'])
		expect(specifiersOf("const m = await import('@/lib/auth')\nimport './side.css'")).toEqual(['./side.css', '@/lib/auth'])
		// A type alias right before a real re-export must not hide it.
		expect(specifiersOf("export type Foo = Bar\nexport { x } from '@/routes/y'")).toEqual(['@/routes/y'])
		expect(specifiersOf("import type {\n\tA,\n\tB,\n} from '@/lib'\nimport {\n\tc,\n} from './c'")).toEqual(['./c'])
	})
})
