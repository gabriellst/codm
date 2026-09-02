import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { isBarrel } from './lib/barrels'
import { stripJsonComments } from './lib/strip-comments'

/**
 * barrel-liveness — a barrel module that NO subpath exposes and NO file imports is dead, and a dead
 * barrel is worse than no barrel: it advertises a public surface that does not exist.
 *
 * Family: `registry-pointers` / `doc-coherence` / `test-liveness` — the dead-pointer rails. This one
 * covers the pointer shape those three do not: a file that re-exports ten modules and is itself
 * reachable from nowhere. It costs nothing at runtime, so it is invisible until somebody reads it
 * and believes it.
 *
 * THE CONCRETE MISS (2026-08-07). `packages/api/typescript/core/src/utils/index.ts` re-exported ten
 * modules. `core/package.json` exposes exactly four subpaths (`.`, `./schema`, `./schemas`,
 * `./events`) and none of them is that file; `grep` found zero importers in the whole repo. Five of
 * the ten — `paths`, `Http`, `MimeTypeExtractor`, `ForwardRequest`, `decorators/WithRetry` — are
 * also missing from `core/src/index.ts`, so `forwardRequest` was importable from NOWHERE while a
 * barrel spelled it out as if it were public. Running the rail found a second one on the first
 * pass: `core/src/utils/decorators/index.ts`, same shape, same emptiness. Both are gone.
 *
 * SCOPE — packages that declare `exports`, and only those. The rule's premise is "no subpath in
 * package.json names it", which is a question you can only ask where subpaths exist. Applications
 * (`packages/api/typescript`, `packages/app/react`, `packages/app/astro`) declare no `exports` map at
 * all: every barrel in them is internal by construction, and asking this question there would
 * either flag the entire bounded-context convention or need a second, different rule. Narrow and
 * true beats broad and hand-waved.
 *
 * PREMISE UPDATE (2026-08-11, `ea42eca8e`): that premise broke the day `packages/api/typescript`
 * declared its first `exports` entry (`./testing`, for the frontend integration harness). The
 * package still IS an application — every context under `src/` still talks to every other one
 * through `tsconfig.json`'s `@*`/`@test/*` path aliases, never relative imports — but the moment its
 * `package.json` gained ANY `exports` field, `barrelsIn()` put its whole tree in scope (by
 * construction: it scans `pkg.dir` for every exports-declaring package). 27 barrels went "dead"
 * overnight. Investigating each one split them three ways:
 *
 *   - 19 are genuinely imported — `src/auth/enums/index.ts` via `@auth/enums`, `tests/support/
 *     index.ts` via `@test/support`, both used across dozens of files, both unchanged since
 *     `v2.0.0` — because `resolutionCandidates()` understood relative specifiers and bare
 *     workspace-package names, never a tsconfig `paths` alias. A PRECISION bug in the resolver, not
 *     a reason to weaken the check: it now adds tsconfig-`paths` as a third way a specifier can
 *     resolve, read from each importing file's OWNER package's own (real, on-disk) `tsconfig.json`
 *     — never a hardcoded `@*`/`@test/*` guess, because that pattern is this repo's convention
 *     today, not a constant this rail should know by name.
 *   - 9 were genuinely dead — no import, no alias, nothing — because this package's barrels had
 *     simply never been checked before. Deleted (`src/auth/{objects,services,usecases}/index.ts`,
 *     `src/notifications/{repositories,usecases}/index.ts`, `src/owner/{entities,usecases}/
 *     index.ts`, `src/ui/usecases/billing/index.ts`), all confirmed byte-identical to `v2.0.0` and
 *     zero-importer by every channel above, including the new alias one.
 *   - 1, `src/ui/usecases/index.ts`, is dead by EVERY import channel and still real: `scripts/
 *     create-template/contexts.ts`'s `notifications` strip recipe edits it byte-level (removing the
 *     `ListNotifications` export line) when a product drops that context — deleting the barrel broke
 *     `contexts.test.ts` with an `ENOENT`. It is the `ui` BFF's permanent, growing aggregation
 *     barrel (that file's own doctrine: "the space the product builds in, never a skeleton to
 *     delete"), alive by a channel this resolver cannot see because it isn't an ES import at all — a
 *     byte-pattern target in a declarative table. Same fix shape as the alias case: a fourth
 *     resolution channel, read from that table's REAL exports (`CONTEXT_DECLS`, `resolvePath`), not
 *     a hand-maintained exemption.
 *
 * THE FOURTH CHANNEL DOES NOT EXIST IN THIS REPO, AND ITS ABSENCE IS MEASURED (2026-08-14). The
 * upstream rail resolves a barrel through create-template's byte-level strip recipes; codm's
 * `scripts/create-template/` is an EARLIER fork of that machinery and has no such recipes. Measured,
 * not assumed: there is no `contexts.ts` here, `plan.ts` has no `contexts` field in `StampSelection`
 * (upstream's does, and imports `CONTEXT_DECLS`/`resolveContexts`/`resolvePath` from it), and the
 * only `lineStrips` this stamp ever emits is DERIVED — the CLAUDE.md workspace-table rows of dropped
 * workspaces (`plan.ts`, "CLAUDE.md workspace-table rows"). Zero barrels here are alive by that
 * channel, so the channel was REMOVED rather than ported empty. Removing it also removed its floor
 * (`expect(STRIP_TARGETS.size).toBeGreaterThan(0)`) — a floor that is true upstream and false here
 * is the per-repo-number defect this wave keeps finding, and importing an empty table just to
 * satisfy it would be the ceremony version of the same mistake. Porting `contexts.ts` to satisfy it
 * honestly would have meant authoring strip recipes for codm's 10 contexts against a stamp flag
 * (`--contexts`) that does not exist here — inventing a feature, not porting a gate. The day this
 * stamp gains context selection, the channel comes back with it.
 *
 * ─── SCOPE BUG, found by the witness and fixed here (2026-08-14) ───
 *
 * The first witness run of this port did NOT go red: a brand-new barrel planted at
 * `core/src/testemunha/index.ts`, reachable by nothing, was reported clean. A gate that cannot fail
 * is the whole reason this wave exists, so the miss was chased instead of shrugged at.
 *
 * `barrelsIn()` skipped a file when it lay under ANY other package's directory. The stated intent is
 * ownership — "`packages/contracts` must not claim `packages/contracts/generated/typescript`'s" —
 * but the condition has no direction, and `packages/api/typescript/core` is NESTED INSIDE
 * `packages/api/typescript`. So every core file matched "lies under another package" and was
 * dropped. Measured: core contributed 0 barrels of the 104 walked; with the direction fixed
 * (`other.dir` must start with `pkg.dir`), 124 are walked and core contributes 17 — and after the
 * `isBarrel` stream fix below, 134 walked with core at 18.
 *
 * (An earlier revision of this paragraph said "126 walked, core contributes 22". Both numbers were
 * wrong in the same way: 22 was core's count of files NAMED `index.ts`, four of which are content
 * modules and not barrels at all, and 126 counted a planted witness. Corrected here rather than
 * quietly — a docblock whose thesis is "measured, not assumed" does not get to round.)
 *
 * WHEN IT STARTED, AND WHERE ELSE IT IS TRUE. The bug is dormant until the OUTER package declares an
 * `exports` map, which `packages/api/typescript` did on 2026-08-11 (`ea42eca8e`, the `./testing`
 * entry). From that commit onward the rail has been blind to `core` — the package the rail was
 * WRITTEN FOR, where `core/src/utils/index.ts` and `core/src/utils/decorators/index.ts` were the two
 * findings that justified it. The same probe run against template-fullstack reports `core barrels:
 * []` there too, out of 117 walked. That is an upstream defect, not a porting artifact, and it goes
 * back in the return leg of this program.
 *
 * WHAT THE FIX IMMEDIATELY FOUND: `core/src/utils/decorators/index.ts`, dead by every channel —
 * `WithRetry` is named by no subpath, is absent from `core/src/index.ts`, and has zero importers in
 * the entire repo. It is literally the second of the two barrels the upstream docblock says are
 * "both gone": deleted there, still here, and invisible here for as long as the scope bug held.
 * Deleted, with `WithRetry.ts` itself left in place — the same call upstream made and recorded as a
 * separate open ledger item ("Deletar órfãos do core TS: SerializedRequest, ForwardRequest,
 * WithRetry"), because orphan-module deletion is a different question from barrel liveness.
 *
 * A barrel nothing reaches — not by subpath, not by relative import, not by alias — is exactly as
 * dead as before; see the fixtures below.
 *
 * CHECK 1 — every barrel in an `exports`-declaring package is exposed by a subpath, imported by at
 * least one file (relative, bare workspace-package, or tsconfig `paths` alias), or named in
 * DEAD_BARREL_EXEMPTIONS with a why.
 * CHECK 2 — exemptions are alive: the file still exists AND is still unreachable. Runs through the
 * same resolver as CHECK 1, so it inherits the alias precision for free — an exemption "fossilizes"
 * (goes dead-forever, unauditable) only if NOTHING, including an alias import, ever reaches it.
 * CHECK 3 — machinery floor, on a synthetic tree, exercising all three verdicts (dead / exposed by
 * subpath / imported) so the rail cannot pass merely because this repo happens to be tidy.
 * CHECK 4 — machinery floor for the alias resolver specifically: a barrel reachable ONLY through a
 * package-owned tsconfig `paths` alias is live; a barrel in the SAME aliased package that nothing
 * reaches — not even by alias — stays dead. Proves the addition is a new CANDIDATE path, not a
 * blanket "this package has `paths`, so everything in it resolves" shortcut.
 */

export { isBarrel } from './lib/barrels'

const ROOT = resolve(import.meta.dirname, '..')

/**
 * A barrel that is deliberately unreachable, each with a why. Check 2 kills the entry the moment
 * the file disappears or something reaches it, so an exemption cannot fossilize. Empty is the goal:
 * the fix for a dead barrel is normally to delete it or to expose it.
 *
 * ─── IT WAS 16 ENTRIES LONG, AND THE 16 WERE ONE FINDING ───
 *
 * First run of this rail in codm (2026-08-14) returned 16 dead barrels, all inside
 * `packages/api/typescript`. The upstream precedent for that verdict is deletion — the parent repo
 * hit the same shape on 2026-08-11 and deleted 9 — but measuring before copying the verdict changed
 * it. Every one of the 15 context barrels named modules that ARE consumed, 7 to 35 importers each,
 * and every single one of those imports went STRAIGHT TO THE MODULE. Zero went through the barrel.
 * The folder was alive; the barrel was a door nobody used.
 *
 * Widening the measurement to all 116 layer folders showed the 16 were not a category at all: 99
 * barrels had an importer and 17 did not, 648 imports went through a barrel against 1319 around
 * one, and the SAME folder often did both (`agent/types`: 29 through, 39 around). Nothing was wrong
 * with any individual import. What was missing was a rule about which door exists — and the 16 were
 * simply the folders that happened to land on zero.
 *
 * So the exemption list is empty, and the rule lives in `scripts/lib/context-layers.ts`, enforced by
 * `scripts/context-barrels.test.ts`: five layers keep a barrel (`controllers`, `enums`, `objects`
 * — structural, a registrar namespace-imports them — plus `middlewares` and `schemas`, settled
 * convention at 61:3 and 29:8), every other layer has none, and 40 barrels were deleted with the
 * 138 imports that went through them rewritten to the module. The scaffolder reads the same table,
 * so it cannot put a forbidden door back.
 *
 * THIS RAIL STILL ASKS ITS OWN QUESTION. `context-barrels` asks whether a door SHOULD exist; this
 * one asks whether an existing one can be REACHED. A barrel in a `required` layer that nothing
 * imports and no subpath exposes is still dead, and still fails here.
 */
const DEAD_BARREL_EXEMPTIONS: { path: string; why: string }[] = []

const UNWALKABLE = new Set([
	'node_modules',
	'.git',
	'.nx',
	'target',
	'tmp',
	'coverage',
	'.astro',
	'.expo',
	'.output',
	'.vite',
	'.worktrees',
])
const UNWALKABLE_PATHS = new Set(['.claude/worktrees'])

/**
 * The one place a path becomes a KEY here — so it is also the one place the separator is decided.
 *
 * Both sides of every comparison in this file have to spell the same path the same way, and they
 * do not arrive that way: the `exports` subpaths and `paths` aliases are `/`-separated literals
 * read out of package.json / tsconfig.json, while everything walked off disk comes through `join`
 * and `relative`, which are `\`-separated on Windows. Without the `\`→`/` pass no barrel ever
 * matched its own subpath there and all 91 of them reported dead at once.
 */
const norm = (p: string): string => p.split('\\').join('/').replace(/^\.\//, '').replace(/\/+$/, '')

/**
 * Every file under `dir` matching `keep`, repo-relative and `/`-separated — this is where a path
 * enters the file, so it leaves here already in the one spelling everything downstream compares
 * against. `UNWALKABLE_PATHS` is a `/` literal too, and `ownerPackage` decides ownership with
 * `startsWith(`${pkg.dir}/`)`: handing it a `\`-separated path made it find no owner at all, which
 * silently switched off the tsconfig-alias channel and reported every alias-only barrel dead.
 *
 * `dist` is walked: this repo commits SDK dists.
 */
function walkFiles(root: string, keep: (name: string) => boolean, dir = root, acc: string[] = []): string[] {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name)
		const rel = norm(relative(root, full))
		if (entry.isDirectory()) {
			if (UNWALKABLE.has(entry.name) || UNWALKABLE_PATHS.has(rel)) continue
			walkFiles(root, keep, full, acc)
		} else if (keep(entry.name)) acc.push(rel)
	}
	return acc.sort()
}

const isTsFile = (name: string): boolean => /\.(ts|tsx|mts|cts)$/.test(name) && !name.endsWith('.d.ts')

export interface ExportsPackage {
	/** Repo-relative package directory. */
	dir: string
	/** npm name, so a bare-specifier import can be matched against it. */
	name: string
	/** Repo-relative files a subpath exposes; `*` patterns are expanded against the tree. */
	exposed: Set<string>
}

/** Every workspace package that declares an `exports` map, with its subpath targets resolved. */
export function exportsPackages(root: string): ExportsPackage[] {
	const out: ExportsPackage[] = []
	for (const manifest of walkFiles(root, name => name === 'package.json')) {
		let pkg: Record<string, unknown>
		try {
			pkg = JSON.parse(readFileSync(join(root, manifest), 'utf-8'))
		} catch {
			continue
		}
		const exportsMap = pkg.exports
		if (typeof exportsMap !== 'object' || exportsMap === null) continue
		const dir = norm(dirname(manifest))
		const exposed = new Set<string>()
		for (const target of Object.values(exportsMap as Record<string, unknown>)) {
			if (typeof target !== 'string') continue
			const rel = norm(join(dir, target))
			// `"./*": "./src/*/index.ts"` — a wildcard subpath exposes every file it can match.
			if (rel.includes('*')) {
				for (const hit of new Bun.Glob(rel).scanSync({ cwd: root, onlyFiles: true })) exposed.add(norm(hit))
			} else exposed.add(rel)
		}
		out.push({ dir, name: typeof pkg.name === 'string' ? pkg.name : dir, exposed })
	}
	return out
}

const SPECIFIER = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g

const tsconfigPathsCache = new Map<string, Record<string, string[]>>()

/**
 * `compilerOptions.paths` declared in `<root>/<pkgDir>/tsconfig.json`, read fresh off disk — never a
 * hardcoded guess at the pattern names (`@*`, `@test/*`, …). Those are THIS repo's convention today;
 * a different package could alias differently, and a rail that hardcoded the current spelling would
 * silently stop working the day it changed, the same failure mode as everything else this file
 * exists to catch. No tsconfig, no `paths` field, or a file that doesn't parse all resolve to `{}` —
 * no aliases, treated the same as a package that never had any, not a broken repo.
 */
function tsconfigPaths(root: string, pkgDir: string): Record<string, string[]> {
	const cacheKey = `${root}::${pkgDir}`
	const cached = tsconfigPathsCache.get(cacheKey)
	if (cached !== undefined) return cached
	let paths: Record<string, string[]> = {}
	const tsconfigFile = join(root, pkgDir, 'tsconfig.json')
	if (existsSync(tsconfigFile)) {
		try {
			const parsed = JSON.parse(stripJsonComments(readFileSync(tsconfigFile, 'utf-8')))
			const declared = parsed?.compilerOptions?.paths
			if (declared !== null && typeof declared === 'object') paths = declared
		} catch {
			// Malformed tsconfig — same posture as exportsPackages() on a bad package.json: no aliases,
			// not a crash.
		}
	}
	tsconfigPathsCache.set(cacheKey, paths)
	return paths
}

/** The most specific `ExportsPackage` whose directory contains `file` — nested packages win over parents. */
function ownerPackage(file: string, packages: ExportsPackage[]): ExportsPackage | undefined {
	let best: ExportsPackage | undefined
	for (const pkg of packages) {
		if (file !== pkg.dir && !file.startsWith(`${pkg.dir}/`)) continue
		if (best === undefined || pkg.dir.length > best.dir.length) best = pkg
	}
	return best
}

/**
 * Repo-relative candidates `specifier` could resolve to via a tsconfig `paths` alias declared by
 * `pkgDir`'s OWN `tsconfig.json` — the same wildcard-pattern matching `tsc` itself does (longest
 * prefix, `*` captures the middle, exact keys need no `*`). A specifier that matches no pattern
 * yields no candidates, same as today.
 */
function aliasCandidates(root: string, pkgDir: string, specifier: string): string[] {
	const out: string[] = []
	for (const [pattern, targets] of Object.entries(tsconfigPaths(root, pkgDir))) {
		const star = pattern.indexOf('*')
		let captured: string | null = null
		if (star === -1) {
			if (specifier === pattern) captured = ''
		} else {
			const prefix = pattern.slice(0, star)
			const suffix = pattern.slice(star + 1)
			if (specifier.startsWith(prefix) && specifier.endsWith(suffix) && specifier.length >= prefix.length + suffix.length)
				captured = specifier.slice(prefix.length, specifier.length - suffix.length)
		}
		if (captured === null) continue
		for (const target of targets) {
			const resolved = target.includes('*') ? target.replace('*', captured) : target
			const stripped = norm(join(pkgDir, resolved)).replace(/\.(ts|tsx|js|jsx)$/, '')
			out.push(stripped, `${stripped}.ts`, `${stripped}.tsx`, `${stripped}/index.ts`, `${stripped}/index.tsx`)
		}
	}
	return out
}

/** Candidate files a specifier could resolve to, repo-relative (extensionless and /index forms). */
export function resolutionCandidates(root: string, fromFile: string, specifier: string, packages: ExportsPackage[]): string[] {
	if (specifier.startsWith('.')) {
		const base = norm(join(dirname(fromFile), specifier))
		const stripped = base.replace(/\.(ts|tsx|js|jsx)$/, '')
		return [stripped, `${stripped}.ts`, `${stripped}.tsx`, `${stripped}/index.ts`, `${stripped}/index.tsx`]
	}

	// A bare specifier resolves through TWO independent channels — a real workspace package's
	// `exports` map, or the IMPORTING FILE's own package's tsconfig `paths` alias. A repo can use
	// either or both; a dead barrel resolves through NEITHER.
	const out: string[] = []

	const pkg = packages.find(entry => specifier === entry.name || specifier.startsWith(`${entry.name}/`))
	if (pkg !== undefined) {
		// A bare/subpath specifier only reaches what the exports map exposes — that IS the point of
		// the map, and it is what makes `@template/core-typescript/utils` unresolvable today.
		const sub = specifier === pkg.name ? '.' : `./${specifier.slice(pkg.name.length + 1)}`
		out.push(...[...pkg.exposed].filter(target => target.startsWith(norm(join(pkg.dir, sub.replace(/^\.\//, '').split('/')[0] ?? '')))))
	}

	const owner = ownerPackage(fromFile, packages)
	if (owner !== undefined) out.push(...aliasCandidates(root, owner.dir, specifier))

	return out
}

/** Every barrel some file in the repo imports. */
export function importedBarrels(root: string, barrels: Set<string>, packages: ExportsPackage[]): Set<string> {
	const hit = new Set<string>()
	for (const file of walkFiles(root, isTsFile)) {
		const source = readFileSync(join(root, file), 'utf-8')
		for (const match of source.matchAll(SPECIFIER)) {
			const specifier = match[1] as string
			for (const candidate of resolutionCandidates(root, file, specifier, packages)) {
				if (barrels.has(candidate) && candidate !== file) hit.add(candidate)
			}
		}
	}
	return hit
}

/** Every barrel inside an `exports`-declaring package, repo-relative. */
export function barrelsIn(root: string, packages: ExportsPackage[]): Set<string> {
	const barrels = new Set<string>()
	for (const pkg of packages) {
		for (const file of walkFiles(join(root, pkg.dir), name => name === 'index.ts' || name === 'index.tsx')) {
			const rel = norm(join(pkg.dir, file))
			// A nested package owns its own barrels — `packages/contracts` must not claim
			// `packages/contracts/generated/typescript`'s. The test is "does a package nested INSIDE
			// this one own the file", and the direction matters: written as "does the file lie under
			// ANY other package", it also erases the INNER package's own files, because they lie under
			// the OUTER package's dir too. That is not hypothetical — see the docblock's SCOPE BUG.
			if (packages.some(other => other !== pkg && other.dir.startsWith(`${pkg.dir}/`) && rel.startsWith(`${other.dir}/`))) continue
			if (isBarrel(readFileSync(join(root, rel), 'utf-8'))) barrels.add(rel)
		}
	}
	return barrels
}

const PACKAGES = exportsPackages(ROOT)
const BARRELS = barrelsIn(ROOT, PACKAGES)
const EXPOSED = new Set(PACKAGES.flatMap(pkg => [...pkg.exposed]))
const IMPORTED = importedBarrels(ROOT, BARRELS, PACKAGES)

describe('barrel-liveness (a barrel with no subpath and no importer is dead)', () => {
	test('every barrel in an exports-declaring package is exposed or imported', () => {
		// Floor: zero packages or zero barrels would make "no dead barrels" true for the wrong reason.
		// (Upstream has a fourth floor here — the create-template strip targets; see the docblock for why
		// this tree has none to count.)
		expect(PACKAGES.length, 'found zero packages declaring `exports` — the manifest walk is broken, not the repo').toBeGreaterThan(3)
		expect(BARRELS.size, 'found zero barrels — the re-export detector is broken, not the repo').toBeGreaterThan(5)
		expect(IMPORTED.size, 'found zero imported barrels — the specifier resolver is broken, not the repo').toBeGreaterThan(0)

		const exempt = new Set(DEAD_BARREL_EXEMPTIONS.map(entry => entry.path))
		const dead = [...BARRELS].filter(barrel => !exempt.has(barrel) && !EXPOSED.has(barrel) && !IMPORTED.has(barrel)).sort()

		expect(
			dead,
			'Dead barrel(s): a module whose entire body is re-exports, that NO `exports` subpath names, that ' +
				'NO file imports, and that NO create-template strip recipe targets. It compiles, it reads as ' +
				'public API, and nothing can reach it — the shape that made `forwardRequest` unimportable from ' +
				'anywhere while a barrel spelled it out. Delete it, expose it via a subpath, or name it in ' +
				'DEAD_BARREL_EXEMPTIONS (scripts/barrel-liveness.test.ts) with a why. Scanned ' +
				`${BARRELS.size} barrel(s) across ${PACKAGES.length} package(s); ${EXPOSED.size} subpath target(s), ` +
				`${IMPORTED.size} imported.`,
		).toEqual([])
	})

	test('DEAD_BARREL_EXEMPTIONS entries are alive (file exists and is still unreachable)', () => {
		expect(
			DEAD_BARREL_EXEMPTIONS.length,
			'DEAD_BARREL_EXEMPTIONS.length is the ratchet (idiom: "the registry IS the ratchet") — growing requires editing this number in the SAME diff; shrinking requires lowering it too. Zero is the goal and the current state: the 16 that were here became a declared rule (scripts/lib/context-layers.ts) instead of a tolerated list.',
		).toBe(0)
		const fossil = DEAD_BARREL_EXEMPTIONS.filter(
			entry => !existsSync(join(ROOT, entry.path)) || EXPOSED.has(entry.path) || IMPORTED.has(entry.path),
		).map(entry => entry.path)
		expect(
			fossil,
			'Fossil exemption — the barrel was deleted, or something now reaches it. Drop the entry so the file ' +
				'is gated like every other barrel.',
		).toEqual([])
	})

	// Machinery floor — all three verdicts against a SYNTHETIC tree, every run.
	test('fixture: a dead barrel is flagged; a subpath-exposed one and an imported one are not', () => {
		const tmpRoot = mkdtempSync(join(tmpdir(), 'barrel-liveness-fixture-'))
		try {
			const write = (rel: string, body: string) => {
				mkdirSync(dirname(join(tmpRoot, rel)), { recursive: true })
				writeFileSync(join(tmpRoot, rel), body)
			}
			write(
				'pkg/package.json',
				JSON.stringify({ name: '@fixture/pkg', exports: { '.': './src/index.ts', './schema': './src/schema/index.ts' } }),
			)
			write('pkg/src/index.ts', "export * from './live'\n")
			write('pkg/src/live/index.ts', "export * from './thing'\n") // imported by the root barrel
			write('pkg/src/live/thing.ts', 'export const thing = 1\n')
			write('pkg/src/schema/index.ts', "export * from './zod'\n") // exposed by a subpath
			write('pkg/src/schema/zod.ts', 'export const z = 1\n')
			write('pkg/src/orphan/index.ts', "export * from './dead'\n") // NEITHER — the offender
			write('pkg/src/orphan/dead.ts', 'export const dead = 1\n')
			write('pkg/src/notabarrel/index.ts', "export const own = 1\nexport * from './dead'\n") // has content
			write('pkg/src/notabarrel/dead.ts', 'export const dead = 1\n')
			// An APP package: no `exports` map, so its barrels are out of scope by construction.
			write('app/package.json', JSON.stringify({ name: '@fixture/app' }))
			write('app/src/whatever/index.ts', "export * from './x'\n")
			write('app/src/whatever/x.ts', 'export const x = 1\n')

			const packages = exportsPackages(tmpRoot)
			expect(packages.map(p => p.dir)).toEqual(['pkg'])
			expect([...(packages[0] as ExportsPackage).exposed].sort()).toEqual(['pkg/src/index.ts', 'pkg/src/schema/index.ts'])

			const barrels = barrelsIn(tmpRoot, packages)
			expect([...barrels].sort()).toEqual([
				'pkg/src/index.ts',
				'pkg/src/live/index.ts',
				'pkg/src/orphan/index.ts',
				'pkg/src/schema/index.ts',
			])

			const exposed = new Set(packages.flatMap(p => [...p.exposed]))
			const imported = importedBarrels(tmpRoot, barrels, packages)
			expect([...imported]).toEqual(['pkg/src/live/index.ts'])

			// THE VERDICT, all three ways at once.
			expect([...barrels].filter(b => !exposed.has(b) && !imported.has(b)).sort()).toEqual(['pkg/src/orphan/index.ts'])

			// The classifier itself: re-exports only vs. a module that declares something.
			expect(isBarrel("export * from './a'\nexport type { B } from './b'\n")).toBe(true)
			expect(isBarrel("// a comment\n\nexport { c } from './c'\n")).toBe(true)
			expect(isBarrel("export const own = 1\nexport * from './a'\n")).toBe(false)
			expect(isBarrel('')).toBe(false)

			// The wrapped named re-export the line-based version could not see. A formatter's line
			// width must not decide whether this rail watches a file.
			expect(isBarrel("export {\n\tAgentRunner,\n\tMockAgentRunner,\n} from './AgentRunner'\n")).toBe(true)
			expect(isBarrel("export type {\n\tA,\n} from './a'\nexport {\n\tB,\n} from './b'\n")).toBe(true)
			// Still not a barrel: wrapped re-export plus content of its own.
			expect(isBarrel("export {\n\tA,\n} from './a'\nexport const own = 1\n")).toBe(false)
			// Still not a barrel: comment-only, and a plain import is not a re-export.
			expect(isBarrel('// nothing but a comment\n')).toBe(false)
			expect(isBarrel("import { a } from './a'\n")).toBe(false)
		} finally {
			rmSync(tmpRoot, { recursive: true, force: true })
		}
	})

	// Machinery floor for the alias resolver specifically (the PREMISE UPDATE above). THE FALSIFIER:
	// a barrel reached ONLY through a package-owned tsconfig `paths` alias must be live, and a barrel
	// in that SAME aliased package that nothing reaches — not even by alias — must stay dead. If the
	// second assertion ever goes green for the wrong reason (the resolver starts treating "package
	// has `paths`" as "everything in it resolves"), this is where it would be caught.
	test('fixture: an alias-only import (tsconfig paths) counts as live; a barrel unreachable even via alias stays dead', () => {
		const tmpRoot = mkdtempSync(join(tmpdir(), 'barrel-liveness-alias-fixture-'))
		try {
			const write = (rel: string, body: string) => {
				mkdirSync(dirname(join(tmpRoot, rel)), { recursive: true })
				writeFileSync(join(tmpRoot, rel), body)
			}
			write('aliaspkg/package.json', JSON.stringify({ name: '@fixture/aliaspkg', exports: { '.': './src/index.ts' } }))
			// The exact shape this repo's `packages/api/typescript/tsconfig.json` uses: a catch-all
			// `@*` alias to `./src/*`, no `baseUrl` — NOT hardcoded into the resolver, read from here.
			// Written as raw JSONC text (not `JSON.stringify`), on purpose: a `//` comment line PLUS a
			// glob-shaped `include` value in the SAME file is exactly the shape that broke a naive
			// line/block regex stripper (it reads the first `/*` inside `"src/**/*.ts"` as a block-comment
			// open and eats forward to an unrelated `*/`, corrupting `paths` before `JSON.parse` ever
			// runs — measured against the real tsconfig on the first pass of this fix; that naive regex
			// lived in THIS file until S4 T4 moved comment-stripping to scripts/lib/strip-comments.ts).
			// This fixture is what makes `stripJsonComments()`'s string-awareness a tested behavior, not
			// an assumption.
			write(
				'aliaspkg/tsconfig.json',
				[
					'{',
					'  "compilerOptions": {',
					'    "paths": { "@*": ["./src/*"] }',
					'  },',
					'  // a comment, same line-shape as the real tsconfig',
					'  "include": ["src/**/*.ts"]',
					'}',
				].join('\n'),
			)
			write('aliaspkg/src/index.ts', 'export const root = 1\n') // has content — not a barrel
			write('aliaspkg/src/live/index.ts', "export * from './thing'\n") // reachable ONLY via '@live'
			write('aliaspkg/src/live/thing.ts', 'export const thing = 1\n')
			write('aliaspkg/src/consumer.ts', "import { thing } from '@live'\nexport { thing }\n") // alias import, no relative path anywhere
			write('aliaspkg/src/dead/index.ts', "export * from './thing'\n") // THE OFFENDER — reachable no way, alias included
			write('aliaspkg/src/dead/thing.ts', 'export const thing = 1\n')

			const packages = exportsPackages(tmpRoot)
			expect(packages.map(p => p.dir)).toEqual(['aliaspkg'])

			const barrels = barrelsIn(tmpRoot, packages)
			expect([...barrels].sort()).toEqual(['aliaspkg/src/dead/index.ts', 'aliaspkg/src/live/index.ts'])

			// Direct unit coverage of the new candidate channel, isolated from the file-walk.
			expect(resolutionCandidates(tmpRoot, 'aliaspkg/src/consumer.ts', '@live', packages)).toContain('aliaspkg/src/live/index.ts')
			// A specifier that matches NO declared pattern (doesn't even start with `@`) yields no
			// candidates at all — the resolver doesn't invent a match, it applies the ones on disk.
			expect(resolutionCandidates(tmpRoot, 'aliaspkg/src/consumer.ts', 'left-field-package', packages)).toEqual([])

			const exposed = new Set(packages.flatMap(p => [...p.exposed]))
			const imported = importedBarrels(tmpRoot, barrels, packages)

			// LIVE-VIA-ALIAS: `@live` resolves via the package's own tsconfig `paths`, no relative
			// import and no subpath export in sight.
			expect([...imported]).toEqual(['aliaspkg/src/live/index.ts'])

			// THE FALSIFIER: `dead/index.ts` sits in the SAME aliased package and stays dead — the
			// alias channel is a candidate resolver, not a per-package amnesty.
			expect([...barrels].filter(b => !exposed.has(b) && !imported.has(b)).sort()).toEqual(['aliaspkg/src/dead/index.ts'])
		} finally {
			rmSync(tmpRoot, { recursive: true, force: true })
		}
	})
})
