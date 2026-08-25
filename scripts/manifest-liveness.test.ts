import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { sourceViews } from './lib/strip-comments'

/**
 * manifest-liveness — a symbol that DECLARES coverage must be imported by something that EXECUTES
 * it. A test that asserts the manifest's SHAPE is not an executor.
 *
 * Family: `registry-pointers` / `doc-coherence` / `test-liveness` / `barrel-liveness` — the
 * dead-pointer rails. This one covers the shape none of them can see. `test-liveness` asks "does a
 * target run this TEST FILE?" and a manifest is not a test file. `barrel-liveness` asks "does
 * anything import this?" and the answer here is YES — by the very test that makes the manifest look
 * alive. The pointer is not dangling; it aims at a reader instead of a runner.
 *
 * THE CONCRETE MISS (2026-08-08, measured in the Ronda product tree). `packages/e2e/utils/walk.ts`
 * exports `WALK_STOPS` with 11 stops and `WALK_EXCLUSIONS` with 2 justified absences, together
 * covering all 13 routes of the product. `packages/e2e/utils/walk.test.ts` (bun) gates the
 * manifest's shape against the generated route tree — a real gate, and it passes. And NO spec under
 * `packages/e2e/tests/` imports `WALK_STOPS`; there is no `00-founder-walk.spec.ts` there and no
 * `e2e:walk` script. 11 routes × 5 invariants = 55 declared assertions that never ran in a browser,
 * in a product whose e2e reports 15/15 green and in which the founder found 4 real defects by hand.
 * A naive "exported symbol with no importer" rail is GREEN on that tree and catches nothing: the
 * shape gate is the importer. The property that was missing was never reachability — it was an
 * EXECUTOR.
 *
 * WHY A DECLARED REGISTRY AND NOT A DIRECTORY RULE. "A manifest in `packages/e2e/utils/` needs an
 * importer under `packages/e2e/tests/`" is the tempting structural version, and it is measurably
 * WRONG in this tree. Exactly two modules under `packages/e2e/utils/` are covered by a bun shape
 * gate — `walk.ts` and `ports.ts` — and `ports.ts` is imported by NO spec in either tree: its
 * executor is `packages/e2e/scripts/run-e2e.ts`, the runner that decides what to do about a busy
 * port. The directory rule would fire a false positive on it in the parent AND in Ronda. Who
 * executes a manifest is not derivable from where the manifest lives, so it is declared as a value
 * with a why, next to the rule that reads it — the shape of `CORPORA`/`UNRUN_TESTS` in
 * `scripts/test-liveness.test.ts`. Narrow and true beats broad and hand-waved.
 *
 * THIS TREE SAID "ZERO" FIRST, AND THE VERDICT CHANGED UNDER IT (2026-08-14). Swept before
 * porting — `packages/e2e/{utils,lib,scripts}/`, `scripts/{,lib,detectors,cli,graph/core}/`, the
 * per-context `registry.ts`, `packages/api/typescript/tests/` — by name heuristic and structurally,
 * every top-level `export const` in those folders. Zero instances of the defect. Every candidate had
 * a real runtime executor, and the two that looked closest were not manifests at all: `DETECTORS`
 * (scripts/detectors/run-all.ts) and `CLASSIFICATION_RULES` (scripts/review.ts) DECLARE and EXECUTE
 * in the same module, so there is no import to lose; `app-routes.ts` exports an `interface`, erased
 * before anything runs. Notably codm has no `walk.ts` equivalent — no manifest enumerates routes for
 * its 10 Playwright specs to walk. That is an ABSENCE (no coverage is claimed), not this defect
 * (coverage claimed, never executed), and porting the rail then would have meant inventing a
 * registry to satisfy its own non-empty floor.
 *
 * What changed the answer was this wave's own work. `scripts/lib/context-layers.ts` declares which
 * layers of a bounded context have a barrel, and TWO things read it: `scripts/context-barrels.test.ts`
 * — a shape gate — and `scripts/cli/wire.ts`, the generator that must refuse to create a forbidden
 * door. Drop the import from `wire.ts` and the table keeps looking alive, because the gate still
 * reads it and still passes; meanwhile the scaffolder goes back to writing barrels into forbidden
 * layers and the gate goes back to deleting them, green on both sides and undoing each other in the
 * middle. That is this file's shape exactly, and it is why the rail is here now and was not before.
 *
 * SCOPE — registered manifests only. A manifest nobody registers is invisible to this rail, and
 * that is the cost of the paragraph above being true. What check 2 buys back is that a registered
 * entry cannot be defeated quietly: delete the module, rename the symbol, or point `executor` at a
 * bun shape gate and the rail goes red on the entry itself. Two further things it does NOT claim:
 * that the executor is itself run by CI (that is `test-liveness`'s question for `*.test.ts` and the
 * `e2e` target's for specs), and that the executor uses every entry of the manifest (it asks for a
 * runtime import, not for coverage of the list).
 *
 * ROOT_OVERRIDE (env) retargets the walked tree, the same convention the detectors use
 * (`scripts/detectors/route-closure.ts:48`). This file is a bun test rather than a detector, so it
 * reads the same variable and is pointed at another checkout the same way:
 * `ROOT_OVERRIDE=/path/to/product bun test scripts/manifest-liveness.test.ts`. That is how the
 * Ronda red above was measured, and it is how a child tree can be asked the question from here.
 *
 * CHECK 1 — every registered manifest is imported, at RUNTIME, by at least one file its `executor`
 * glob names, or carries an UNEXECUTED_MANIFESTS exemption with a why.
 * CHECK 2 — registry and exemptions are alive: the module exists and still exports the symbol, the
 * executor glob names at least one file and names NO bun shape gate (`*.test.ts` — promoting the
 * shape gate to executor is precisely the move that would silence check 1), and an exemption dies
 * the moment the manifest gains an executor or disappears.
 * CHECK 3 — machinery floor, on a synthetic tree, exercising every verdict (orphan / executed /
 * exempt) plus the two resolution rules that decide them (`import type` is erased and cannot
 * execute; a namespace import that actually reads the symbol counts), so the rail cannot pass merely
 * because this repo happens to be tidy.
 */

const ROOT = process.env.ROOT_OVERRIDE ? resolve(process.env.ROOT_OVERRIDE) : resolve(import.meta.dirname, '..')

/** A symbol that declares coverage, and the files whose job is to make that coverage happen. */
export interface CoverageManifest {
	/** The exported binding that declares the coverage. */
	symbol: string
	/** Repo-relative module that exports it. */
	module: string
	/** Glob naming the files that EXECUTE what the symbol declares. Never a `*.test.ts`. */
	executor: string
	/** Why those files are the executor — and why the symbol's own unit test is not. */
	why: string
}

/**
 * The manifests this tree declares. One entry per symbol that promises coverage; the entry travels
 * with the file, and `scripts/` is inherited surface, so every child is asked the same question
 * about the harness it inherited.
 */
const COVERAGE_MANIFESTS: CoverageManifest[] = [
	{
		symbol: 'barrelAllowedIn',
		module: 'scripts/lib/context-layers.ts',
		executor: 'scripts/cli/wire.ts',
		why:
			'`CONTEXT_LAYERS` declares WHICH LAYERS OF A BOUNDED CONTEXT HAVE A BARREL, and the promise it makes is ' +
			'that the scaffolder honours it — `bun cli` must refuse to create a door the table forbids. The registered ' +
			'symbol is the ACCESSOR rather than the table because that is the binding which crosses into the executor: ' +
			'the table is read inside its own module by `barrelAllowedIn`, and `wire.ts` imports the function. Losing ' +
			'that import is exactly the failure, and registering the table instead would ask about an import that was ' +
			'never supposed to exist. The only thing that can discharge the promise is `wire.ts` calling it at runtime. ' +
			'`scripts/context-barrels.test.ts` must NOT count: it gates the repo against the table, which is a different ' +
			'promise, and it is precisely the reader that would keep the table looking alive. Drop the import from ' +
			'wire.ts and the generator goes back to writing barrels into forbidden layers while the gate deletes them — ' +
			'green on both sides, undoing each other in the middle, which is the exact failure this file names.',
	},
]

/**
 * Named exemptions for a manifest that deliberately has no executor. A DECISION with a why, never a
 * silencer: check 2 fails the moment an executor appears (or the manifest is deleted), so the
 * exemption cannot fossilize. Empty is the goal — the fix for an orphan manifest is the spec that
 * walks it, not an entry here.
 */
const UNEXECUTED_MANIFESTS: { symbol: string; why: string }[] = []

const norm = (p: string): string => p.replace(/^\.\//, '').replace(/\/+$/, '')

/** Files a glob names, repo-relative and sorted. */
export function globFiles(root: string, pattern: string): string[] {
	return [...new Bun.Glob(pattern).scanSync({ cwd: root, onlyFiles: true })].map(norm).sort()
}

/** Does a relative specifier written in `fromFile` resolve to `moduleRel`? */
export function resolvesTo(fromFile: string, specifier: string, moduleRel: string): boolean {
	if (!specifier.startsWith('.')) return false
	const base = norm(join(dirname(fromFile), specifier)).replace(/\.(ts|tsx|js|jsx)$/, '')
	return [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].includes(moduleRel)
}

const IMPORT = /import\s+([\s\S]*?)\s*from\s*['"]([^'"]+)['"]/dg

/**
 * Does `source` import `symbol` from `moduleRel` in a way that RUNS?
 *
 * `import type { WALK_STOPS }` is erased before anything executes, so a type-only importer is a
 * reader — the exact distinction this rail exists to make, one level down. A namespace import counts
 * only when the file actually reads the symbol off it.
 *
 * MASK-AWARE (L5-1, MW-8, 2026-08-12): `IMPORT` is matched against `sourceViews(source).mask`, not
 * the raw text — a comment or a STRING that merely quotes `import { WALK_STOPS } from '../utils/walk'`
 * is blanked before matching and can no longer masquerade as a real import (measured false-VERDE: the
 * text alone used to count).
 *
 * GROUP-INDICES, NOT REEXECUTION (L5-r3-6, MW-15, 2026-08-12): clause/specifier are located by the
 * capture groups' own offsets (`match.indices`, the `/d` — hasIndices — flag) against a SINGLE match
 * of `IMPORT` on `mask`, never by re-running `IMPORT` against a slice of the original. A prior version
 * did exactly that (`new RegExp(IMPORT.source).exec(original)`), and the reexecution is itself
 * vulnerable: a decoy comment INSIDE the clause — `import { X } /* was: from '../old' *\/ from '../real'`
 * — still contains its own literal `from '../old'` text once the span is sliced back from the ORIGINAL
 * (only `mask` blanks it), and `IMPORT`'s lazy `[\s\S]*?` stops at that FIRST `from` on reexecution —
 * extracting the decoy specifier instead of the real one (measured false-NEGATIVE: a real import was
 * read as an orphan). Offsets are preserved 1:1 between `mask` and `source`, so a span found on one
 * slices the same text out of the other — which view each group is actually SLICED FROM is the next
 * paragraph.
 *
 * CLAUSE FROM MASK, SPECIFIER FROM SOURCE (L5-r4-1, MW-16, 2026-08-12): the two spans are sliced from
 * DIFFERENT views on purpose, not both from `source` as a prior version of this line did. The
 * specifier NEEDS `source` — it is a string literal, and `mask` blanks every string's interior, so
 * slicing it from `mask` would return blanks instead of the module path. The clause is the opposite:
 * it is CODE, never a string, so `mask` is safe for it and `source` is not — a comment sitting INSIDE
 * the clause — `import { Real, /* re-exports: A, WALK_STOPS as Legacy, C *\/ Other }` — is plain text
 * once sliced from `source`, and the comma-split below then reads its `WALK_STOPS as Legacy` as a real
 * binding (measured false-VERDE: this function returned true for a symbol that was only ever MENTIONED
 * inside a comment, never actually imported). `exportsSymbol` below already reads its own declarations
 * from `mask` for exactly this reason; this brings its sibling in line. Slicing the clause from `mask`
 * blanks the comment's interior — commas included — so the comma-split sees only the real bindings on
 * either side of it.
 */
export function importsSymbolAtRuntime(source: string, fromFile: string, moduleRel: string, symbol: string): boolean {
	const { mask } = sourceViews(source)
	for (const match of mask.matchAll(IMPORT)) {
		const clauseSpan = match.indices?.[1]
		const specifierSpan = match.indices?.[2]
		if (!clauseSpan || !specifierSpan) continue
		const clause = mask.slice(clauseSpan[0], clauseSpan[1]).trim()
		const specifier = source.slice(specifierSpan[0], specifierSpan[1])
		if (!resolvesTo(fromFile, specifier, moduleRel)) continue
		if (/^type\b/.test(clause)) continue
		const named = clause.match(/\{([\s\S]*)\}/)?.[1]
		if (named !== undefined) {
			const bindings = named
				.split(',')
				.map(entry => entry.trim())
				.filter(Boolean)
			if (bindings.some(entry => !/^type\s/.test(entry) && (entry === symbol || entry.startsWith(`${symbol} as `)))) return true
		}
		const namespace = clause.match(/\*\s+as\s+(\w+)/)?.[1]
		if (namespace !== undefined && new RegExp(`\\b${namespace}\\.${symbol}\\b`).test(mask)) return true
	}
	return false
}

/**
 * Does `source` export `symbol` at all? Guards the registry against a rename that would mute it.
 *
 * `async` and the generator `*` are in the pattern because they were MISSING, and the way that was
 * found is the way it always is: registering `renderVideo` (2026-08-10) — an
 * `export async function` — produced "no longer exports it" against a module that plainly exports
 * it. The failure mode is the worst kind for a rail: it does not let a bad entry through, it makes a
 * GOOD entry impossible, so whoever hits it concludes the registry is broken and skips registering.
 * Every async export in this tree was unregisterable until this line.
 *
 * MASK-AWARE (L5-1, MW-8): matched against `sourceViews(source).mask` — a comment OR a string that
 * merely quotes `export const WALK_STOPS = []` no longer counts as a real export declaration.
 */
export function exportsSymbol(source: string, symbol: string): boolean {
	const { mask } = sourceViews(source)
	const declaration =
		`export\\s+(?:declare\\s+)?(?:` +
		`(?:async\\s+)?function\\b\\s*\\*?\\s*${symbol}\\b` +
		`|(?:const|let|var|class|type|interface|enum)\\s+${symbol}\\b` +
		`)`
	if (new RegExp(declaration).test(mask)) return true
	return [...mask.matchAll(/export\s*\{([\s\S]*?)\}/g)].some(match =>
		(match[1] ?? '')
			.split(',')
			.map(entry => entry.trim())
			.some(entry => entry === symbol || entry.endsWith(` as ${symbol}`)),
	)
}

/** The files that execute a manifest: named by its glob AND importing its symbol at runtime. */
export function executorsOf(root: string, manifest: CoverageManifest): string[] {
	return globFiles(root, manifest.executor).filter(file =>
		importsSymbolAtRuntime(readFileSync(join(root, file), 'utf-8'), file, manifest.module, manifest.symbol),
	)
}

const EXECUTORS = new Map(COVERAGE_MANIFESTS.map(manifest => [manifest.symbol, executorsOf(ROOT, manifest)]))

describe('manifest-liveness (a declared coverage manifest that nothing executes is a promise, not a gate)', () => {
	test('every registered coverage manifest has at least one executor', () => {
		// Floor: an empty registry would make "no orphan manifests" true for the wrong reason.
		expect(COVERAGE_MANIFESTS.length, 'the registry is empty — nothing is being asked, so nothing can fail').toBeGreaterThan(0)

		const exempt = new Set(UNEXECUTED_MANIFESTS.map(entry => entry.symbol))
		const orphans = COVERAGE_MANIFESTS.filter(
			manifest => !exempt.has(manifest.symbol) && (EXECUTORS.get(manifest.symbol) ?? []).length === 0,
		).map(manifest => {
			const named = globFiles(ROOT, manifest.executor).length
			return `${manifest.symbol} (${manifest.module}) — ${named} file(s) match "${manifest.executor}", none imports it`
		})

		expect(
			orphans,
			'Orphan coverage manifest: a symbol that DECLARES what gets covered and that nothing under its executor glob ' +
				'imports. Something almost certainly imports it — the unit test that gates its shape — and that is what makes ' +
				'this invisible: the shape gate is green, the coverage never ran. This is the Ronda shape, where WALK_STOPS ' +
				'declared 11 routes × 5 invariants = 55 assertions that never opened a browser. Write the executor, or name ' +
				'the symbol in UNEXECUTED_MANIFESTS (scripts/manifest-liveness.test.ts) with a why.',
		).toEqual([])
	})

	test('registry and exemptions are alive (module exports the symbol; executor names files and no shape gate)', () => {
		const broken: string[] = []
		for (const manifest of COVERAGE_MANIFESTS) {
			const modulePath = join(ROOT, manifest.module)
			if (!existsSync(modulePath)) {
				broken.push(`${manifest.symbol}: ${manifest.module} does not exist`)
				continue
			}
			if (!exportsSymbol(readFileSync(modulePath, 'utf-8'), manifest.symbol)) {
				broken.push(`${manifest.symbol}: ${manifest.module} no longer exports it`)
			}
			const named = globFiles(ROOT, manifest.executor)
			if (named.length === 0) broken.push(`${manifest.symbol}: executor glob "${manifest.executor}" names zero files`)
			const gates = named.filter(file => /\.test\.tsx?$/.test(file))
			// A shape gate promoted to executor would turn check 1 green while nothing executes — the
			// single move that defeats this rail, so it is the single move check 2 forbids.
			if (gates.length > 0) broken.push(`${manifest.symbol}: executor glob names bun shape gate(s): ${gates.join(', ')}`)
		}

		const fossil = UNEXECUTED_MANIFESTS.filter(entry => {
			const manifest = COVERAGE_MANIFESTS.find(candidate => candidate.symbol === entry.symbol)
			return manifest === undefined || (EXECUTORS.get(entry.symbol) ?? []).length > 0
		}).map(entry => `${entry.symbol}: the manifest is gone, or it now has an executor`)

		expect(
			[...broken, ...fossil],
			'Dead registry entry or fossil exemption — the entry describes a tree that no longer exists, so it is gating ' +
				'nothing. Update it in scripts/manifest-liveness.test.ts (or drop the exemption, so the manifest is gated like ' +
				'every other one).',
		).toEqual([])
	})

	// Machinery floor — every verdict against a SYNTHETIC tree, every run.
	test('fixture: shape-gated-only is flagged; executed and exempt are not; type-only never counts', () => {
		const tmpRoot = mkdtempSync(join(tmpdir(), 'manifest-liveness-fixture-'))
		try {
			const write = (rel: string, body: string) => {
				mkdirSync(dirname(join(tmpRoot, rel)), { recursive: true })
				writeFileSync(join(tmpRoot, rel), body)
			}
			const entry = (symbol: string, module: string): CoverageManifest => ({
				symbol,
				module,
				executor: 'e2e/tests/**/*.spec.ts',
				why: 'fixture',
			})

			// THE OFFENDER — declared, shape-gated, and named by a spec only as a TYPE.
			write('e2e/utils/walk.ts', 'export type Stop = { path: string }\nexport const WALK_STOPS: Stop[] = [{ path: "/a" }]\n')
			write('e2e/utils/walk.test.ts', "import { WALK_STOPS } from './walk'\nconsole.log(WALK_STOPS.length)\n")
			write('e2e/tests/00-unrelated.spec.ts', "import type { Stop } from '../utils/walk'\nexport const s: Stop | null = null\n")

			// EXECUTED — a spec imports the symbol for real.
			write('e2e/utils/covered.ts', 'export const COVERED_STOPS = [{ path: "/b" }]\n')
			write('e2e/utils/covered.test.ts', "import { COVERED_STOPS } from './covered'\nconsole.log(COVERED_STOPS.length)\n")
			write('e2e/tests/01-covered.spec.ts', "import { COVERED_STOPS } from '../utils/covered'\nconsole.log(COVERED_STOPS)\n")

			// EXECUTED THROUGH A NAMESPACE — counts only because the file reads the symbol off it.
			write('e2e/utils/ns.ts', 'export const NS_STOPS = [{ path: "/c" }]\n')
			write('e2e/tests/02-ns.spec.ts', "import * as walk from '../utils/ns'\nconsole.log(walk.NS_STOPS)\n")
			write('e2e/utils/unused-ns.ts', 'export const UNUSED_NS_STOPS = [{ path: "/d" }]\n')
			write('e2e/tests/03-unused-ns.spec.ts', "import * as other from '../utils/unused-ns'\nconsole.log(other)\n")

			// EXEMPT — orphan by construction, answered by a named exemption.
			write('e2e/utils/exempt.ts', 'export const EXEMPT_STOPS = [{ path: "/e" }]\n')
			write('e2e/utils/exempt.test.ts', "import { EXEMPT_STOPS } from './exempt'\nconsole.log(EXEMPT_STOPS.length)\n")

			// STRING-ONLY IMPORT (L5-1, MW-8) — the ONLY mention of the symbol is the text of an import
			// statement sitting inside a JS string, never a real `import`. Measured false-VERDE before the
			// mask-aware fix: `stripCLikeComments` strips comments only, so this string text survived and
			// counted as a runtime import.
			write('e2e/utils/string-only.ts', 'export const STRING_ONLY_STOPS = [{ path: "/f" }]\n')
			write('e2e/tests/04-string-only.spec.ts', 'export const note = "import { STRING_ONLY_STOPS } from \'../utils/string-only\'"\n')

			const walk = entry('WALK_STOPS', 'e2e/utils/walk.ts')
			const covered = entry('COVERED_STOPS', 'e2e/utils/covered.ts')
			const ns = entry('NS_STOPS', 'e2e/utils/ns.ts')
			const unusedNs = entry('UNUSED_NS_STOPS', 'e2e/utils/unused-ns.ts')
			const exemptManifest = entry('EXEMPT_STOPS', 'e2e/utils/exempt.ts')
			const stringOnly = entry('STRING_ONLY_STOPS', 'e2e/utils/string-only.ts')
			const manifests = [walk, covered, ns, unusedNs, exemptManifest, stringOnly]

			// The resolution rules that decide the verdicts, stated one at a time.
			expect(executorsOf(tmpRoot, walk), 'a type-only import is erased — it can never execute the manifest').toEqual([])
			expect(executorsOf(tmpRoot, covered)).toEqual(['e2e/tests/01-covered.spec.ts'])
			expect(executorsOf(tmpRoot, ns), 'a namespace import that READS the symbol executes it').toEqual(['e2e/tests/02-ns.spec.ts'])
			expect(executorsOf(tmpRoot, unusedNs), 'a namespace import that never reads the symbol does not').toEqual([])
			expect(
				executorsOf(tmpRoot, stringOnly),
				'the text of an import living inside a STRING must not count as a runtime import (L5-1, MW-8)',
			).toEqual([])

			// THE VERDICT, all three ways at once.
			const exempt = new Set([exemptManifest.symbol])
			const orphans = manifests
				.filter(manifest => !exempt.has(manifest.symbol) && executorsOf(tmpRoot, manifest).length === 0)
				.map(manifest => manifest.symbol)
			expect(orphans.sort()).toEqual(['STRING_ONLY_STOPS', 'UNUSED_NS_STOPS', 'WALK_STOPS'])

			// The shape gate is inside the tree and must never be mistaken for the executor.
			expect(globFiles(tmpRoot, 'e2e/utils/**/*.test.ts')).toEqual([
				'e2e/utils/covered.test.ts',
				'e2e/utils/exempt.test.ts',
				'e2e/utils/walk.test.ts',
			])
			expect(globFiles(tmpRoot, walk.executor).some(file => /\.test\.tsx?$/.test(file))).toBe(false)

			// The liveness reader itself: a rename must not go unnoticed.
			expect(exportsSymbol('export const WALK_STOPS = []\n', 'WALK_STOPS')).toBe(true)
			expect(exportsSymbol("export { WALK_STOPS } from './walk'\n", 'WALK_STOPS')).toBe(true)
			expect(exportsSymbol('export const WALK_STOPS_V2 = []\n', 'WALK_STOPS')).toBe(false)
			expect(exportsSymbol('// export const WALK_STOPS = []\n', 'WALK_STOPS')).toBe(false)
			// String-immunity (L5-1, MW-8): the export text living inside a STRING must not count either.
			expect(exportsSymbol('const note = "export const WALK_STOPS = []"\n', 'WALK_STOPS')).toBe(false)
			expect(
				importsSymbolAtRuntime(
					'const note = "import { WALK_STOPS } from \'../utils/walk\'"\n',
					'e2e/tests/00-note.spec.ts',
					'e2e/utils/walk.ts',
					'WALK_STOPS',
				),
				'a specifier-shaped STRING is not a real import — mask blanks its interior before IMPORT matches',
			).toBe(false)

			// L5-r3-6 (MW-15): a decoy `from '../old'` living INSIDE a block comment inside the clause
			// must not win the lazy match on reextraction. Group spans are read from `mask` (where the
			// decoy is already blanked), never by re-running IMPORT against the sliced ORIGINAL (which
			// would still contain the decoy's literal text and stop there instead).
			const decoyImport = "import { WALK_STOPS } /* was: from '../old' */ from '../real'\n"
			expect(
				importsSymbolAtRuntime(decoyImport, 'e2e/tests/00-note.spec.ts', 'e2e/real.ts', 'WALK_STOPS'),
				'the decoy `from` inside the comment must not hijack the specifier — only ../real must resolve',
			).toBe(true)
			expect(
				importsSymbolAtRuntime(decoyImport, 'e2e/tests/00-note.spec.ts', 'e2e/old.ts', 'WALK_STOPS'),
				'the comment-quoted ../old must never resolve — that would prove the decoy won',
			).toBe(false)

			// L5-r4-1 (MW-16): a comment INSIDE the clause itself — not just before `from` — must not
			// contribute fake bindings when the clause is comma-split. Before the fix `clause` was
			// sliced from the ORIGINAL source (like `specifier` still correctly is), so the comment's
			// own text `WALK_STOPS as Legacy` survived the slice and split out as a binding that was
			// never actually imported — only ever mentioned in a comment. `exportsSymbol` already reads
			// its declarations from `mask`; this brings importsSymbolAtRuntime in line with it.
			const commentedClause = "import { Real, /* re-exports: A, WALK_STOPS as Legacy, C */ Other } from '../thing'\n"
			expect(
				importsSymbolAtRuntime(commentedClause, 'e2e/tests/00-note.spec.ts', 'e2e/thing.ts', 'WALK_STOPS'),
				'a binding-shaped mention INSIDE a comment inside the clause must not count as a real import (L5-r4-1)',
			).toBe(false)
			expect(
				importsSymbolAtRuntime(commentedClause, 'e2e/tests/00-note.spec.ts', 'e2e/thing.ts', 'Other'),
				'the REAL bindings on either side of the comment must still resolve',
			).toBe(true)
			expect(
				importsSymbolAtRuntime(
					"import { Real, WALK_STOPS as W } from '../thing'\n",
					'e2e/tests/00-note.spec.ts',
					'e2e/thing.ts',
					'WALK_STOPS',
				),
				'a REAL aliased import (no comment involved) must still count',
			).toBe(true)

			// `async` and the generator `*` were MISSING until 2026-08-10, and the shape of that bug is
			// the nasty one: it never let a bad entry through — it made a GOOD entry impossible.
			// Registering `renderVideo` (an `export async function`) reported "no longer exports it"
			// against a module that plainly exports it, and the natural reading of that is "the registry
			// is broken, skip it". Every async export in this tree was unregisterable.
			expect(exportsSymbol('export async function renderVideo() {}\n', 'renderVideo')).toBe(true)
			expect(exportsSymbol('export function* walk() {}\n', 'walk')).toBe(true)
			expect(exportsSymbol('export function *walk() {}\n', 'walk')).toBe(true)
			expect(exportsSymbol('export async function* stream() {}\n', 'stream')).toBe(true)
			// E o boundary continua valendo: prefixo não é o símbolo.
			expect(exportsSymbol('export async function renderVideoV2() {}\n', 'renderVideo')).toBe(false)
		} finally {
			rmSync(tmpRoot, { recursive: true, force: true })
		}
	})
})
