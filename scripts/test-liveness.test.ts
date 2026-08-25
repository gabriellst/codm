import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'

/**
 * test-liveness — EVERY test file in this repo, IN EVERY LANGUAGE, is executed by at least one
 * DECLARED target.
 *
 * Ported from codedm (`scripts/test-liveness.test.ts`, origin `d893a8f1`). Sibling of
 * `registry-pointers.test.ts` (dead `skill:`/`patterns:` pointers) and `doc-coherence.test.ts`
 * (dead paths in prose). Same disease, different organ: a pointer that aims at nothing costs zero
 * at runtime and is therefore invisible until a human reads it. Here the pointer runs the other way
 * — a test file that no target aims AT. It compiles, it is committed, `bun test:tooling` says
 * 0 fail, and it has never executed once.
 *
 * The concrete misses in THIS tree, on the rail's first run:
 *   · `scripts/cli/` — 12 files, 126 tests (the whole frontend+backend scaffolder golden suite),
 *     green the entire time and never once executed by any target,
 *   · `scripts/graph/tests/` — 9 files, and three of them RED. Not red because of a code bug: each
 *     names content this tree does not have (`.specs`/`.plans` fixtures deleted in the repurpose, a
 *     `finance` bounded context that never existed, a gitignored `.graph/graph.json`). Red-forever
 *     behind an unrun folder is indistinguishable from green, which is the whole point.
 * Neither was a taxonomy problem. Both were REACH: the tooling suite is a hand-kept literal list of
 * paths in one package.json script, and a list is only as live as the last person who remembered
 * it. This file is the thing that remembers.
 *
 * WHY POLYGLOT (2026-08-07). The first version matched `\.test\.tsx?$` and nothing else, so the
 * whole question "does this test run?" was never asked of Go or Rust. It cost 18 days of red:
 * `packages/contracts/generated/go/tests/discriminator_test.go` named three `wire.*` symbols a
 * regen had deleted, `go test ./...` there answered `FAIL [build failed]` from 2026-07-20, and no
 * target ran it — `packages/contracts` declares `test: "bun test codegen/"`, `packages/client` has
 * no `test` target at all, and this rail could not see the file. A rail that is blind to a language
 * is not "TypeScript-scoped"; it is a rail that reports GREEN over a red suite. The same blindness
 * hid `generated/rust/tests/slot.rs` and the three `client/dist/rust/tests/*.rs`.
 *
 * WHY LIVENESS AND NOT LOCATION. The rail asserts "some target reaches this file", never "this file
 * lives at path P". Moving a test between two covered roots is a free refactor and MUST stay green
 * — otherwise the rail stops being a liveness gate and becomes a path shackle, and the next honest
 * reorganization has to fight it. The one place a literal path IS load-bearing is a target that
 * names a single FILE (`test:tooling` names several); check 2 gates those the same way
 * registry-pointers gates a `patterns:` glob — the pointer must resolve.
 *
 * WHY REACH IS MODULE-AWARE, NOT PREFIX-AWARE, FOR THE NATIVE LANGUAGES. `go test ./...` does NOT
 * recurse into a nested module — that is why `api-go`'s target has to say
 * `go test ./... && go -C core test ./...` in the first place, and it is exactly the semantics that
 * left `packages/contracts/generated/go` (its own module, nested under nobody) reachable by no one.
 * Modeling Go reach as a path prefix would have declared that module covered by the repo root and
 * reproduced the bug inside the rail meant to catch it. Same for Cargo: a crate is the unit.
 *
 * CHECK 1 — coverage. Every walked test file is reached by a declared target, is inside a declared
 * CORPUS, or carries a named UNRUN_TESTS exemption with a why.
 * CHECK 2 — every literal path a target names exists. A target arg pointing at a deleted directory
 * is `bun test`'s version of the dead-pointer shape: the runner exits 0 having run nothing.
 * CHECK 3 — CORPORA are alive (root exists AND still holds specimens).
 * CHECK 4 — UNRUN_TESTS are alive (file exists AND is still uncovered) — an exemption cannot fossilize.
 * CHECK 5 — warning-only radar: declared paths that reach zero test files today.
 * CHECK 6 — negative fixture against a real temp tree, so checks 1–2 cannot pass merely by the
 * repo happening to be clean, and so the "moved test stays green" direction is proved, not assumed.
 * The fixture covers all three languages, including the nested-module case.
 */

const ROOT = resolve(import.meta.dirname, '..')

/** The three test-file shapes this repo can produce. `lang` is what makes reach comparable. */
export type TestLang = 'ts' | 'go' | 'rust'

const TS_TEST_FILE = /\.test\.tsx?$/
const GO_TEST_FILE = /_test\.go$/
const RUST_TEST_FILE = /\.rs$/

/**
 * Classify a repo-relative path, or `undefined` when it is not a test file.
 *
 * Rust is the one that needs its directory: cargo's INTEGRATION tests are `<crate>/tests/*.rs`
 * (one binary per file), while unit tests live in `#[cfg(test)] mod` blocks INSIDE ordinary source
 * — a source file is not a test file, so scanning `src/**` here would flag every `.rs` in the tree.
 * `tests/*.rs` is the shape that has a filename of its own, and therefore the shape that can be
 * orphaned by a missing target.
 */
export function testLangOf(file: string): TestLang | undefined {
	if (TS_TEST_FILE.test(file)) return 'ts'
	if (GO_TEST_FILE.test(file)) return 'go'
	if (RUST_TEST_FILE.test(file) && /(^|\/)tests\/[^/]+$/.test(file)) return 'rust'
	return undefined
}

/**
 * Directories no test runner reaches into: dependency trees, VCS metadata, build/cache output, and
 * the worktree pools (`.claude/worktrees/` and `.worktrees/` are gitignored — those are whole
 * sibling checkouts, gated by their own copy of this rail, and walking them would multiply every
 * count).
 */
const UNWALKABLE = new Set([
	'node_modules',
	'.git',
	'.nx',
	'dist',
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
 * Exceptions to the `dist` skip above — subtrees named `dist` that hold COMMITTED SOURCE rather
 * than build garbage. `packages/client/dist` is the polyglot SDK the repo ships and commits (the
 * root `.gitignore` negates the universal `dist/` rule for exactly this subtree,
 * `.gitignore:38-41`), and it carries `dist/rust/tests/*.rs`. Skipping it made three cargo
 * integration tests invisible to this rail on top of the Go one — same blindness, second door.
 */
const WALKABLE_PATHS = new Set(['packages/client/dist'])

/**
 * Corpora — directories holding test SPECIMENS rather than this repo's tests. A specimen is input
 * to something else (a grader, a teaching artifact); executing it is a category error. Each entry
 * names ONE root with a why, and check 3 kills it the moment the root stops holding specimens — the
 * corpus claim can never outlive the corpus.
 */
const CORPORA: { root: string; why: string }[] = [
	{
		root: 'scripts/skill-evals/seeds',
		why: 'each seed is a miniature repo an agent is run AGAINST and then graded; several are broken by DESIGN (the failing assertion is the artifact under evaluation). Sweeping this directory into any target would make the gate red on purpose. The harness that drives them — scripts/skill-evals/run.test.ts — is itself declared and gated.',
	},
	// examples/citizens dropped (go-edge T3, 2026-08-13): the outbox exemplar was reintroduced
	// into the kernel (core/services/outbox) and the directory deleted — a corpus claim covering
	// nothing is an exemption waiting to swallow a real orphan (this gate's own doctrine).
	// The parent repo declares two more corpora here — `examples/pairs` and `examples/slices`. Neither
	// exists in this tree (there is no `examples/` at all), and a corpus claim covering nothing is an
	// exemption waiting to swallow a real orphan, which is this gate's own doctrine. Dropped rather
	// than carried: check 3 below would have failed on them anyway, for a reason that has nothing to
	// do with any orphan test.
]

/**
 * Named exemptions for a single test file no target runs. An entry is a DECISION with a why, never
 * a silencer: check 4 fails the moment the file becomes covered (or disappears), so the exemption
 * cannot fossilize. Empty is the goal — the fix for an orphan is normally a target, not an entry here.
 */
const UNRUN_TESTS: { path: string; why: string }[] = []

// ─────────────────────────────────────────────────────────────────────────────
// Discovery: what a "declared target" actually is in this repo
// ─────────────────────────────────────────────────────────────────────────────

/** One test-runner invocation reachable from a script or an nx target. */
export type DeclaredTarget = {
	/** Human-readable provenance, e.g. `package.json#test:tooling` or `api-typescript:project.json#test`. */
	where: string
	/** Which runner — decides how `args` become reach. */
	lang: TestLang
	/** Repo-relative working directory the invocation runs in. */
	cwd: string
	/** Positional path/package args; empty means "the whole cwd". */
	args: string[]
}

const BUN_TEST = /^bun\s+test(?=\s|$)/
/** `go test …`, and `go -C <dir> test …` (the form api-go uses to cross into its nested core module). */
const GO_TEST = /^go\s+(?:-C\s+(\S+)\s+)?test(?=\s|$)/
const CARGO_TEST = /^cargo\s+test(?=\s|$)/
/** `FOO=bar BAZ=1 bun …` — env prefixes are not part of the command word. */
const ENV_PREFIX = /^(?:[A-Z_][A-Z0-9_]*=\S*\s+)+/
/** `bun run <script>` / `bun <script>` — indirection inside the same package.json. */
const BUN_SCRIPT = /^bun\s+(?:run\s+)?([\w:.-]+)\s*$/

/**
 * `cd <dir>` as its own segment, and `--manifest-path <file>` inside a cargo invocation. Both move
 * the directory the suite actually runs in, and neither is visible to a parser that only reads the
 * verb.
 *
 * WHY THEY ARE HERE (measured on the first run in this repo, 2026-08-14). Without them the rail
 * reported EIGHT false orphans — `packages/contracts/generated/go/tests/*_test.go`,
 * `packages/contracts/generated/rust/tests/*.rs` and `packages/client/dist/rust/tests/*.rs` — all of
 * which DO have a runner:
 *
 *     "test:go":   "cd generated/go && go test ./..."
 *     "test:rust": "cargo test --quiet --manifest-path generated/rust/Cargo.toml"
 *     "test:rust": "cargo test --quiet --manifest-path dist/rust/Cargo.toml"   (packages/client)
 *
 * `command.split(/&&|…/)` throws the `cd` away, so the `go test` landed at `packages/contracts`,
 * which roots no module; the cargo runs landed at the package root, which roots no crate. Both then
 * ALSO tripped check "every native target anchors at a real module/crate root" — the rail accusing
 * the repo of the dead-pointer shape it was itself blind to.
 *
 * This is the same family as the `bun --cwd <dir> run <script>` defect this program found in
 * `docker/Dockerfile.api`: a command form that changes where the work happens, unreadable to anyone
 * who only looks at the verb. A false ORPHAN is not the harmless direction of that mistake — it
 * teaches people to answer the gate with exemptions.
 */
const CD_SEGMENT = /^cd\s+(\S+)$/
const MANIFEST_PATH = /--manifest-path[=\s]+(\S+)/

const norm = (p: string): string => p.replace(/^\.\//, '').replace(/\/+$/, '')

/** Positional path args of a `bun test` segment — flags (and their values) are not paths. */
function positionalArgs(rest: string): string[] {
	const tokens = rest.trim().split(/\s+/).filter(Boolean)
	const out: string[] = []
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i] as string
		if (!token.startsWith('-')) {
			out.push(norm(token))
			continue
		}
		// `-t <pattern>` / `--test-name-pattern <pattern>` consume the next token.
		if ((token === '-t' || token === '--test-name-pattern') && !token.includes('=')) i++
	}
	return out
}

/** A go/cargo package pattern (`./...`, `./cmd/...`) reduced to the sub-path it anchors at. */
export const packagePrefix = (pattern: string): string => norm(pattern.replace(/\.\.\.$/, ''))

/**
 * Every test invocation reachable from `command`, in any of the three languages, following
 * `bun run <script>` indirection inside the same scripts map (one hop is all this repo uses; `seen`
 * makes a cycle terminate). `cwd` is relative to the caller's cwd — `go -C core test` shifts it.
 */
export function testInvocations(
	command: string,
	scripts: Record<string, string>,
	seen = new Set<string>(),
): { lang: TestLang; cwdSuffix: string; args: string[] }[] {
	const out: { lang: TestLang; cwdSuffix: string; args: string[] }[] = []
	// A `cd` segment moves every LATER segment of the same command, and only that command — the
	// shell's own scoping. `join('', x)` normalises to `x`, so an absent prefix costs nothing.
	let cd = ''
	for (const raw of command.split(/&&|\|\||;/)) {
		const segment = raw.trim().replace(ENV_PREFIX, '')

		const moved = segment.match(CD_SEGMENT)
		if (moved) {
			cd = norm(cd === '' ? (moved[1] as string) : join(cd, moved[1] as string))
			continue
		}
		if (BUN_TEST.test(segment)) {
			out.push({ lang: 'ts', cwdSuffix: cd, args: positionalArgs(segment.replace(BUN_TEST, '')) })
			continue
		}
		const go = segment.match(GO_TEST)
		if (go) {
			const suffix = go[1] === undefined ? cd : norm(cd === '' ? go[1] : join(cd, go[1]))
			out.push({ lang: 'go', cwdSuffix: suffix, args: positionalArgs(segment.replace(GO_TEST, '')) })
			continue
		}
		if (CARGO_TEST.test(segment)) {
			const manifest = segment.match(MANIFEST_PATH)?.[1]
			const suffix = manifest === undefined ? cd : norm(cd === '' ? dirname(manifest) : join(cd, dirname(manifest)))
			out.push({ lang: 'rust', cwdSuffix: suffix, args: [] })
			continue
		}
		const indirect = segment.match(BUN_SCRIPT)?.[1]
		if (indirect !== undefined && !seen.has(indirect) && scripts[indirect] !== undefined) {
			seen.add(indirect)
			out.push(...testInvocations(scripts[indirect] as string, scripts, seen))
		}
	}
	return out
}

/** Back-compat shim for the TypeScript half — the shape the first version of this rail exported. */
export const bunTestInvocations = (command: string, scripts: Record<string, string>, seen = new Set<string>()): string[][] =>
	testInvocations(command, scripts, seen)
		.filter(invocation => invocation.lang === 'ts')
		.map(invocation => invocation.args)

const readJson = (path: string): Record<string, unknown> => JSON.parse(readFileSync(path, 'utf-8'))

/** Every directory nx treats as a project: the declared workspaces plus anything with a project.json. */
function projectDirs(): string[] {
	const rootPkg = readJson(join(ROOT, 'package.json'))
	const dirs = new Set<string>()
	for (const pattern of (rootPkg.workspaces as string[] | undefined) ?? []) {
		if (/[*?[\]{}]/.test(pattern)) {
			for (const hit of new Bun.Glob(`${pattern}/package.json`).scanSync({ cwd: ROOT, onlyFiles: true })) {
				dirs.add(norm(hit.replace(/\/package\.json$/, '')))
			}
		} else if (existsSync(join(ROOT, pattern, 'package.json'))) dirs.add(norm(pattern))
	}
	for (const hit of new Bun.Glob('packages/**/project.json').scanSync({ cwd: ROOT, onlyFiles: true })) {
		dirs.add(norm(hit.replace(/\/project\.json$/, '')))
	}
	return [...dirs].sort()
}

/**
 * The real target universe, DISCOVERED rather than assumed — three producers, and nothing else in
 * this repo can run a test file:
 *   1. root `package.json` scripts (`test:tooling`, `test:native`, `detect:self-test`),
 *   2. `project.json` targets whose NAME STARTS WITH `test` — `test`, and also `test:rust`, which
 *      app-tauri names deliberately so `nx run-many -t test` does not match it. A target that is
 *      opt-in is still a declared target: it is nameable in CI and it is where that crate's
 *      invariants are gated. Scoping this scan to the literal name `test` would have declared the
 *      tauri crate an orphan and pushed a false exemption into UNRUN_TESTS,
 *   3. a workspace `package.json` `test` script where no project.json overrides it (nx infers it).
 * A target that shells out to something none of the three parsers recognize (playwright, a bun
 * script) produces zero invocations and therefore covers zero test files — which is the
 * discrimination that matters: a project having a `test` target proves nothing about whether any
 * test under it runs.
 */
export function declaredTargets(): DeclaredTarget[] {
	const targets: DeclaredTarget[] = []

	const push = (where: string, dir: string, invocations: ReturnType<typeof testInvocations>): void => {
		for (const invocation of invocations) {
			targets.push({ where, lang: invocation.lang, cwd: norm(join(dir, invocation.cwdSuffix)), args: invocation.args })
		}
	}

	const rootScripts = (readJson(join(ROOT, 'package.json')).scripts as Record<string, string> | undefined) ?? {}
	for (const [name, command] of Object.entries(rootScripts)) {
		push(`package.json#${name}`, '', testInvocations(command, rootScripts, new Set([name])))
	}

	for (const dir of projectDirs()) {
		const projectJsonPath = join(ROOT, dir, 'project.json')
		const pkgPath = join(ROOT, dir, 'package.json')
		const scripts = existsSync(pkgPath) ? ((readJson(pkgPath).scripts as Record<string, string> | undefined) ?? {}) : {}

		const projectTargets = existsSync(projectJsonPath)
			? ((readJson(projectJsonPath).targets as Record<string, { options?: { command?: string; cwd?: string } }> | undefined) ?? {})
			: {}

		const testTargets = Object.entries(projectTargets).filter(([name]) => name === 'test' || name.startsWith('test:'))
		for (const [name, target] of testTargets) {
			const command = target?.options?.command
			if (command === undefined) continue
			push(`${dir}:project.json#${name}`, norm(target.options?.cwd ?? dir), testInvocations(command, scripts, new Set([name])))
		}

		// project.json wins over the package.json script of the same name — that is nx's own precedence.
		if (projectTargets.test === undefined && scripts.test !== undefined) {
			push(`${dir}:package.json#test`, dir, testInvocations(scripts.test, scripts, new Set(['test'])))
		}
	}

	// NO 4th PRODUCER HERE, and that is a measured difference from the parent repo rather than an
	// omission. Upstream a 4th producer reads `scripts/test-native.ts`'s GO_MODULES/CARGO_CRATES,
	// because there `test:native` is a hand-rolled bun runner and no textual parser can see through a
	// bun script into the suites it spawns. This repo has no such runner and does not need one: its
	// native suites are declared as ORDINARY nx targets, which the three producers above already read
	// — `api-go:test` is `go test ./... && go -C core test ./...`, `@codm/contracts:test` ends in
	// `bun run test:rust && bun run test:go`, `client:test` is `cargo test --manifest-path …`, and
	// `app-tauri:test` is `cargo test --quiet`. Porting `test-native.ts` to satisfy an import would
	// have created a SECOND runner over suites that already have one, and then this rail would be
	// proving reach against a list nothing executes — the exact failure it exists to name.

	return targets
}

// ─────────────────────────────────────────────────────────────────────────────
// Reach: what a target actually covers, per language
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every directory in the tree that roots a Go module / a Cargo crate.
 *
 * Upstream this is imported from `scripts/test-native.ts` — deliberately the RUNNER's own walk, so
 * the rail cannot prove reach against a universe the runner does not execute. Here there is no such
 * runner (see `declaredTargets`), so the walk lives in this file, over the SAME `UNWALKABLE` /
 * `WALKABLE_PATHS` constants the test-file walk above uses. One walk, one notion of "in the tree".
 */
export function nativeRoots(root: string, marker: 'go.mod' | 'Cargo.toml', dir = root, acc: string[] = []): string[] {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name)
		const rel = relative(root, full)
		if (entry.isDirectory()) {
			if ((UNWALKABLE.has(entry.name) || UNWALKABLE_PATHS.has(rel)) && !WALKABLE_PATHS.has(rel)) continue
			nativeRoots(root, marker, full, acc)
		} else if (entry.name === marker) acc.push(relative(root, dir) || '.')
	}
	return acc.sort()
}

/** The nearest ancestor of `file` that roots a module/crate, or undefined when there is none. */
export function ownerOf(file: string, roots: string[]): string | undefined {
	let best: string | undefined
	for (const root of roots) {
		if (!isUnder(file, root === '.' ? '' : root)) continue
		if (best === undefined || root.length > best.length) best = root
	}
	return best
}

/** One target's reach, as the pair (language, anchor) plus the sub-path its package pattern names. */
export type Reach = { lang: TestLang; anchor: string; prefix: string }

export const reachOf = (target: DeclaredTarget): Reach[] => {
	if (target.lang === 'ts') {
		return target.args.length === 0
			? [{ lang: 'ts', anchor: target.cwd, prefix: '' }]
			: target.args.map(arg => ({ lang: 'ts' as const, anchor: norm(join(target.cwd, arg)), prefix: '' }))
	}
	// go/cargo: the anchor is the MODULE/CRATE the cwd roots — never a bare prefix. `./...` covers
	// the whole module; a narrower pattern (`./cmd/...`) narrows it to that sub-path.
	const prefix = target.args.length === 0 ? '' : packagePrefix(target.args[0] as string)
	return [{ lang: target.lang, anchor: target.cwd, prefix }]
}

export const isUnder = (file: string, root: string): boolean => root === '' || file === root || file.startsWith(`${root}/`)

/** Every test file a runner could physically reach, repo-relative, sorted, tagged with its language. */
export function walkTests(root: string, dir = root, acc: { path: string; lang: TestLang }[] = []): { path: string; lang: TestLang }[] {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name)
		const rel = relative(root, full)
		if (entry.isDirectory()) {
			if ((UNWALKABLE.has(entry.name) || UNWALKABLE_PATHS.has(rel)) && !WALKABLE_PATHS.has(rel)) continue
			walkTests(root, full, acc)
		} else {
			const lang = testLangOf(rel)
			if (lang !== undefined) acc.push({ path: rel, lang })
		}
	}
	return acc.sort((a, b) => a.path.localeCompare(b.path))
}

/**
 * Does `reach` cover `file`? TypeScript reach is a path prefix (bun's own positional semantics are
 * a substring filter, strictly MORE permissive — so this model never claims coverage bun would not
 * deliver). Go and Rust reach is OWNERSHIP: the file's nearest module/crate root must BE the
 * anchor, because `go test ./...` stops at a nested `go.mod` and `cargo test` at a nested crate.
 */
export function covers(reach: Reach, file: { path: string; lang: TestLang }, owners: Record<'go' | 'rust', string[]>): boolean {
	if (reach.lang !== file.lang) return false
	if (reach.lang === 'ts') return isUnder(file.path, reach.anchor)
	const owner = ownerOf(file.path, owners[reach.lang])
	if (owner === undefined || norm(owner === '.' ? '' : owner) !== reach.anchor) return false
	return reach.prefix === '' || isUnder(file.path, norm(join(reach.anchor, reach.prefix)))
}

const TARGETS = declaredTargets()
const REACH = TARGETS.flatMap(reachOf)
const TEST_FILES = walkTests(ROOT)
const OWNERS = { go: nativeRoots(ROOT, 'go.mod'), rust: nativeRoots(ROOT, 'Cargo.toml') }

const isCovered = (
	file: { path: string; lang: TestLang },
	reach: Reach[] = REACH,
	owners: Record<'go' | 'rust', string[]> = OWNERS,
): boolean => reach.some(entry => covers(entry, file, owners))
const inCorpus = (file: string): boolean => CORPORA.some(corpus => isUnder(file, corpus.root))
const countOf = (lang: TestLang): number => TEST_FILES.filter(file => file.lang === lang).length

describe('test-liveness (every test file is run by a declared target)', () => {
	test('the target universe is non-empty and every test file is reached by one', () => {
		// Guard against the vacuous-green failure mode: a discovery bug that returns [] would make
		// "no orphans" true for the wrong reason. The suite is meaningless without both sides populated
		// — and per LANGUAGE, because a regex regression in one classifier would silently retire that
		// language's half of the rail while the totals stayed plausible.
		expect(TARGETS.length, 'discovered zero declared targets — the discovery walk is broken, not the repo').toBeGreaterThan(4)
		expect(TEST_FILES.length, 'walked zero test files — the tree walk is broken, not the repo').toBeGreaterThan(100)
		expect(countOf('go'), 'walked zero Go test files — the `_test.go` classifier is broken, not the repo').toBeGreaterThan(10)
		expect(countOf('rust'), 'walked zero Rust test files — the `tests/*.rs` classifier is broken, not the repo').toBeGreaterThan(0)
		expect(OWNERS.go.length, 'found zero go.mod — the module walk is broken').toBeGreaterThan(3)
		expect(OWNERS.rust.length, 'found zero Cargo.toml — the crate walk is broken').toBeGreaterThan(3)

		const exempt = new Set(UNRUN_TESTS.map(entry => entry.path))
		const orphans = TEST_FILES.filter(file => !exempt.has(file.path) && !inCorpus(file.path) && !isCovered(file)).map(
			file => `${file.path} (${file.lang})`,
		)

		expect(
			orphans,
			'Test file(s) no declared target runs — committed, type-checked, and never executed once. ' +
				'Fix by adding the file to the target that OWNS it (a package test target for package code, ' +
				'`test:tooling` in the root package.json for repo tooling, `test:native` for a Go module or ' +
				'Cargo crate), or — if it is a specimen rather than a test — name it in UNRUN_TESTS/CORPORA ' +
				`(scripts/test-liveness.test.ts) with a why. Declared reach today: ${REACH.length} root(s) from ` +
				`${TARGETS.length} target(s); walked ${countOf('ts')} ts / ${countOf('go')} go / ${countOf('rust')} rust.`,
		).toEqual([])
	})

	test('every literal path a target names exists', () => {
		const dead = TARGETS.flatMap(target =>
			target.args
				.filter(arg => !arg.includes('...') && !existsSync(join(ROOT, target.cwd, arg)))
				.map(arg => `${target.where} → ${norm(join(target.cwd, arg))}`),
		)
		expect(
			dead,
			'A target names a path that is not there. `bun test <missing>` runs nothing and still exits 0, so the ' +
				'suite silently shrinks — the same dead-pointer shape registry-pointers gates for `patterns:`. ' +
				'Repoint the arg, or drop it from the script.',
		).toEqual([])
	})

	test('every native target anchors at a real module/crate root', () => {
		const dead = REACH.filter(reach => reach.lang !== 'ts')
			.filter(reach => !OWNERS[reach.lang === 'go' ? 'go' : 'rust'].includes(reach.anchor === '' ? '.' : reach.anchor))
			.map(reach => `${reach.lang}: ${reach.anchor || '<repo root>'}`)
		expect(
			dead,
			'A `go test` / `cargo test` target runs in a directory that roots no module/crate. `go test ./...` ' +
				'there exits 0 having compiled nothing — the native flavour of the dead-pointer shape.',
		).toEqual([])
	})

	test('CORPORA entries are alive (root exists and still holds specimens)', () => {
		const fossil = CORPORA.filter(corpus => {
			const full = join(ROOT, corpus.root)
			return !existsSync(full) || !statSync(full).isDirectory() || walkTests(ROOT, full).length === 0
		}).map(corpus => corpus.root)
		expect(
			fossil,
			'Fossil CORPUS — the root is gone or no longer holds any specimen. Drop the entry; a corpus claim ' +
				'that covers nothing is an exemption waiting to swallow a real orphan.',
		).toEqual([])
	})

	test('UNRUN_TESTS entries are alive (file exists and is still uncovered)', () => {
		const byPath = new Map(TEST_FILES.map(file => [file.path, file]))
		const fossil = UNRUN_TESTS.filter(entry => {
			const file = byPath.get(entry.path)
			return file === undefined || isCovered(file)
		}).map(entry => entry.path)
		expect(
			fossil,
			'Fossil UNRUN_TESTS entry — the file was deleted, or a target now runs it. Drop the exemption so the ' +
				'file is gated like every other test.',
		).toEqual([])
	})

	test('declared paths that reach zero test files are listed as a warning, never a failure', () => {
		const barren = REACH.filter(reach => reach.anchor !== '' && TEST_FILES.every(file => !covers(reach, file, OWNERS)))
		if (barren.length > 0) {
			console.warn(
				`[test-liveness] ${barren.length} declared path(s) hold no test file today — legitimate while a ` +
					`directory is being grown into. Cleanup radar, not a gate:\n${barren.map(reach => `  ${reach.lang}: ${reach.anchor}`).join('\n')}`,
			)
		}
		expect(Array.isArray(barren)).toBe(true)
	})

	// CHECK 7 — the other direction of reach. Liveness asks "does anything run this file?"; nothing asked
	// "does more than one thing run it?". Measured 2026-08-08: `api-typescript:test` said `bun test` with
	// cwd at the package, and `core/` is a nested DIRECTORY of that package (not a nested module, so none
	// of the ownership logic above applies) — so every `core-typescript:test` file ran a second time
	// inside it, 28 files / 195 tests, two PGlite-heavy copies racing each other under `nx run-many`.
	// It cost a flaky suite, not a wrong answer, and it hid in plain sight because the target's own
	// `inputs` already listed only `src/**` and `tests/**`: the cache key and the command disagreed, so
	// a change under `core/` did not even invalidate the run that executed it.
	// Warning, not a gate: a file legitimately covered by both a package target and a broader sweep is a
	// judgement call, and this rail refuses to make judgement calls on the repo's behalf (same posture
	// as check 5). What it will not do is let the overlap be invisible.
	test('test files reached by more than one target are listed as a warning, never a failure', () => {
		const overlapped = TEST_FILES.map(file => ({
			file,
			by: TARGETS.filter(target => reachOf(target).some(reach => covers(reach, file, OWNERS))),
		})).filter(entry => new Set(entry.by.map(target => target.where)).size > 1)

		if (overlapped.length > 0) {
			const byPair = new Map<string, number>()
			for (const entry of overlapped) {
				const key = [...new Set(entry.by.map(target => target.where))].sort().join('  +  ')
				byPair.set(key, (byPair.get(key) ?? 0) + 1)
			}
			console.warn(
				`[test-liveness] ${overlapped.length} test file(s) are run by more than one declared target — ` +
					`duplicated wall-clock, and (when the copies are stateful) a race the suite did not ask for:\n` +
					[...byPair].map(([pair, count]) => `  ${count}x  ${pair}`).join('\n'),
			)
		}
		expect(Array.isArray(overlapped)).toBe(true)
	})

	// Negative fixture — the checks are exercised against a REAL temp tree so they cannot pass merely
	// because this repo happens to be clean (molde: registry-pointers / doc-coherence / skill-examples).
	// All three languages, including the nested-module case that is the whole reason Go reach is
	// ownership-based: without it, `go test ./...` at packages/api/go would read as covering core/.
	test('fixture: an orphan is flagged in every language, and moving a test between covered roots is not', () => {
		const tmpRoot = mkdtempSync(join(tmpdir(), 'test-liveness-fixture-'))
		try {
			for (const dir of [
				'scripts/detectors',
				'scripts/lib',
				'scripts/graph',
				'packages/api/src',
				'packages/go/cmd',
				'packages/go/core/config',
				'packages/lonely-go/tests',
				'packages/crate/tests',
				'packages/lonely-crate/tests',
			]) {
				mkdirSync(join(tmpRoot, dir), { recursive: true })
			}
			const write = (rel: string, body = 'export {}\n') => {
				mkdirSync(dirname(join(tmpRoot, rel)), { recursive: true })
				writeFileSync(join(tmpRoot, rel), body)
			}
			write('scripts/detectors/a.test.ts')
			write('scripts/lib/b.test.ts')
			write('packages/api/src/c.test.ts')
			write('scripts/graph/algo.test.ts') // the ts orphan: plausible home, named by no target

			// Go: one module reached by `go test ./...`, one NESTED module reached only by `go -C core`,
			// one standalone module (the contracts-go shape) reached by nobody.
			write('packages/go/go.mod', 'module fixture/go\n')
			write('packages/go/cmd/main_test.go', 'package cmd\n')
			write('packages/go/core/go.mod', 'module fixture/go/core\n')
			write('packages/go/core/config/config_test.go', 'package config\n')
			write('packages/lonely-go/go.mod', 'module fixture/lonely\n')
			write('packages/lonely-go/tests/wire_test.go', 'package tests\n')

			// Rust: one crate a target names, one nobody names (the generated/rust shape).
			write('packages/crate/Cargo.toml', '[package]\nname="fixture"\n')
			write('packages/crate/tests/slot.rs', '#[test] fn t() {}\n')
			write('packages/lonely-crate/Cargo.toml', '[package]\nname="lonely"\n')
			write('packages/lonely-crate/tests/orphan.rs', '#[test] fn t() {}\n')

			writeFileSync(
				join(tmpRoot, 'package.json'),
				JSON.stringify({
					workspaces: ['packages/api'],
					scripts: { 'test:tooling': 'bun test ./scripts/detectors ./scripts/lib' },
				}),
			)
			writeFileSync(join(tmpRoot, 'packages/api/package.json'), JSON.stringify({ name: 'api', scripts: { test: 'bun test' } }))

			const owners = { go: nativeRoots(tmpRoot, 'go.mod'), rust: nativeRoots(tmpRoot, 'Cargo.toml') }
			expect(owners.go).toEqual(['packages/go', 'packages/go/core', 'packages/lonely-go'])
			expect(owners.rust).toEqual(['packages/crate', 'packages/lonely-crate'])

			const reach: Reach[] = [
				{ lang: 'ts', anchor: 'scripts/detectors', prefix: '' },
				{ lang: 'ts', anchor: 'scripts/lib', prefix: '' },
				{ lang: 'ts', anchor: 'packages/api', prefix: '' },
				{ lang: 'go', anchor: 'packages/go', prefix: '' },
				{ lang: 'go', anchor: 'packages/go/core', prefix: '' },
				{ lang: 'rust', anchor: 'packages/crate', prefix: '' },
			]
			const found = walkTests(tmpRoot)
			expect(found.map(file => file.path)).toEqual([
				'packages/api/src/c.test.ts',
				'packages/crate/tests/slot.rs',
				'packages/go/cmd/main_test.go',
				'packages/go/core/config/config_test.go',
				'packages/lonely-crate/tests/orphan.rs',
				'packages/lonely-go/tests/wire_test.go',
				'scripts/detectors/a.test.ts',
				'scripts/graph/algo.test.ts',
				'scripts/lib/b.test.ts',
			])

			// (a) the orphans are named — one per language, the whole point of the rail.
			expect(found.filter(file => !isCovered(file, reach, owners)).map(file => file.path)).toEqual([
				'packages/lonely-crate/tests/orphan.rs',
				'packages/lonely-go/tests/wire_test.go',
				'scripts/graph/algo.test.ts',
			])

			// (b) LIVENESS, NOT LOCATION: the same file moved from one covered root to another stays
			// covered. A rail that failed here would forbid every honest reorganization.
			const ts = (path: string) => ({ path, lang: 'ts' as const })
			expect(isCovered(ts('scripts/detectors/a.test.ts'), reach, owners)).toBe(true)
			expect(isCovered(ts('scripts/lib/a.test.ts'), reach, owners)).toBe(true)
			expect(isCovered(ts('packages/api/src/deep/nested/a.test.ts'), reach, owners)).toBe(true)

			// (c) MODULE OWNERSHIP, not prefix: dropping the `go -C core` reach must un-cover the nested
			// module and NOTHING else. A prefix model would keep it covered by `packages/go` and hide
			// exactly the bug this rail exists for.
			const withoutCore = reach.filter(entry => entry.anchor !== 'packages/go/core')
			expect(found.filter(file => !isCovered(file, withoutCore, owners)).map(file => file.path)).toEqual([
				'packages/go/core/config/config_test.go',
				'packages/lonely-crate/tests/orphan.rs',
				'packages/lonely-go/tests/wire_test.go',
				'scripts/graph/algo.test.ts',
			])

			// (d) the discovery walk itself, end to end, on the fixture's own manifests.
			const scripts = { 'test:tooling': 'bun test ./scripts/detectors ./scripts/lib', x: 'bun run test:tooling' }
			expect(bunTestInvocations(scripts['test:tooling'], scripts)).toEqual([['scripts/detectors', 'scripts/lib']])
			expect(bunTestInvocations('bun run test:tooling', scripts)).toEqual([['scripts/detectors', 'scripts/lib']])
			expect(bunTestInvocations('bun scripts/run-e2e.ts', {})).toEqual([]) // a bun SCRIPT is not `bun test`
			expect(bunTestInvocations('bun test', {})).toEqual([[]]) // no args ⇒ the whole cwd
			expect(bunTestInvocations('EMIT_OPENAPI=true bun test codegen/', {})).toEqual([['codegen']])

			// (e) the native parsers — the exact commands this repo declares, including `go -C`.
			expect(testInvocations('go test ./... && go -C core test ./...', {})).toEqual([
				{ lang: 'go', cwdSuffix: '', args: ['...'] },
				{ lang: 'go', cwdSuffix: 'core', args: ['...'] },
			])
			expect(testInvocations('cargo test --quiet', {})).toEqual([{ lang: 'rust', cwdSuffix: '', args: [] }])
			expect(testInvocations('bun x playwright test', {})).toEqual([]) // not a runner this rail models
			expect(packagePrefix('./...')).toBe('')
			expect(packagePrefix('./cmd/...')).toBe('cmd')

			// (f) a target arg that names nothing is dead — `bun test` exits 0 having run zero files.
			expect(existsSync(join(tmpRoot, 'scripts/detectors'))).toBe(true)
			expect(existsSync(join(tmpRoot, 'scripts/gone'))).toBe(false)
		} finally {
			rmSync(tmpRoot, { recursive: true, force: true })
		}
	})
})
