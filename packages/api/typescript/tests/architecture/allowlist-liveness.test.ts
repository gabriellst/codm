import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { parse as parseYaml } from 'yaml'

/**
 * Allowlist-liveness guard — every allowlist/exemption entry must still match something REAL.
 *
 * An allowlist entry is a standing permission. When the code it excused is deleted, the entry does
 * not become harmless — it becomes a FOSSIL permission: the next artifact that reappears under the
 * same name/path silently inherits a suppression whose `why`/`reason` was written for code that no
 * longer exists, and nobody re-decides. (The seeding case: slice-closure.allow.yaml went 100%
 * stale — all 4 allowed wire events had been purged from the tree while their suppressions lived
 * on.) This rail turns "remove the entry when the thing it excuses dies" into a build error.
 *
 * Three surfaces are gated (each is a scan of the SOURCE files — regex/yaml parse, no imports):
 *
 *   1. `scripts/detectors/slice-closure.allow.yaml` — each entry's wire event name must still
 *      occur in the tree slice-closure.ts walks (TS src + generated wire bindings + Go), in
 *      non-test files. Parsed with the same `yaml` parser slice-closure itself uses.
 *   2. The discipline rails' `EXEMPTIONS` arrays (console / probe / tx, per RAIL_CONTRACTS) —
 *      each exempted file must exist AND still contain the pattern the exemption excuses
 *      (for tx-discipline, the entry's own `call:` regex).
 *   3. `scripts/detectors/import-direction.ts` rule `exceptions` arrays — each excepted path
 *      prefix must still match at least one file the detector scans.
 *
 * NOT covered here (already liveness-gated at the source): context-map POLICY_EXCEPTIONS —
 * `context-map.test.ts` has its own "policy exceptions are ALIVE" test.
 *
 * False negatives fail loud: if a rail's `EXEMPTIONS` declaration can't be located (renamed,
 * restructured), that is itself a finding — the liveness scan must never silently check nothing.
 *
 * Lives in `tests/architecture/` (molde `console-discipline.test.ts`): mechanical scan +
 * teaching failure message + negative fixtures in a temp dir proving each scan catches offenders.
 */

const API_ROOT = join(import.meta.dir, '..', '..')
const API_SRC = join(API_ROOT, 'src')
const REPO_ROOT = join(API_ROOT, '..', '..', '..')

// ─── Shared helpers ─────────────────────────────────────────────────

function listFiles(dir: string, exts: string[]): string[] {
	const out: string[] = []
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
		const full = join(dir, entry.name)
		if (entry.isDirectory()) out.push(...listFiles(full, exts))
		else if (exts.some(e => entry.name.endsWith(e))) out.push(full)
	}
	return out
}

function lineOf(text: string, index: number): number {
	return text.slice(0, index).split('\n').length
}

/**
 * Two same-length views of a TS source: `blanked` = comment interiors replaced by spaces (string
 * literals kept — values stay readable at their original offsets); `mask` = comment interiors AND
 * string interiors blanked (only structure survives — brackets found here are real code brackets).
 * Closed contract of the scanned files: no regex literal contains a quote character or `//`.
 */
function sourceViews(source: string): { blanked: string; mask: string } {
	const blanked: string[] = []
	const mask: string[] = []
	let state: 'code' | 'line' | 'block' | "'" | '"' | '`' = 'code'
	for (let i = 0; i < source.length; i++) {
		const c = source[i] as string
		const next = source[i + 1]
		const keep = c === '\n' ? '\n' : ' '
		if (state === 'code') {
			if (c === '/' && (next === '/' || next === '*')) {
				state = next === '/' ? 'line' : 'block'
				blanked.push(' ', ' ')
				mask.push(' ', ' ')
				i++
			} else {
				if (c === "'" || c === '"' || c === '`') state = c
				blanked.push(c)
				mask.push(c)
			}
		} else if (state === 'line' || state === 'block') {
			const closes = state === 'line' ? c === '\n' : c === '*' && next === '/'
			if (closes && state === 'line') {
				state = 'code'
				blanked.push('\n')
				mask.push('\n')
			} else if (closes) {
				state = 'code'
				blanked.push(' ', ' ')
				mask.push(' ', ' ')
				i++
			} else {
				blanked.push(keep)
				mask.push(keep)
			}
		} else if (c === '\\') {
			blanked.push(c, next ?? '')
			mask.push(' ', ' ')
			i++
		} else if (c === state || (c === '\n' && state !== '`')) {
			state = 'code'
			blanked.push(c)
			mask.push(c)
		} else {
			blanked.push(c)
			mask.push(keep)
		}
	}
	return { blanked: blanked.join(''), mask: mask.join('') }
}

/** Index just past the close bracket balancing `open` at `openIndex` — count on the MASK view. */
function spanEnd(mask: string, openIndex: number, open: string, close: string): number {
	let depth = 0
	for (let i = openIndex; i < mask.length; i++) {
		if (mask[i] === open) depth++
		else if (mask[i] === close) {
			depth--
			if (depth === 0) return i + 1
		}
	}
	return mask.length
}

// ─── 1. slice-closure.allow.yaml ────────────────────────────────────

const SLICE_ALLOW_FILE = join(REPO_ROOT, 'scripts', 'detectors', 'slice-closure.allow.yaml')

/** Mirror of slice-closure.ts `collectFiles` roots (which derive from template.config REPO) —
 *  the tree an allow entry's wire event must still occur in. Update in lockstep with that walk. */
const SLICE_SCAN_ROOTS = [
	join(REPO_ROOT, 'packages', 'api', 'typescript', 'src'),
	join(REPO_ROOT, 'packages', 'contracts', 'generated', 'typescript', 'src', 'wire', 'events'),
	join(REPO_ROOT, 'packages', 'contracts', 'generated', 'go', 'wire'),
	join(REPO_ROOT, 'packages', 'api', 'go'),
]

interface AllowEntry {
	event: string
	rule?: string
	reason?: string
}

/** slice-closure excludes test files from its walk, so an event surviving only in tests is dead. */
function isTestPath(rel: string): boolean {
	return /\.(test|spec)\.tsx?$/.test(rel) || /_test\.go$/.test(rel) || rel.includes('/tests/') || rel.startsWith('tests/')
}

function deadAllowEntries(allowFile: string, scanRoots: string[]): AllowEntry[] {
	if (!existsSync(allowFile)) return []
	const parsed = parseYaml(readFileSync(allowFile, 'utf8')) as { allow?: AllowEntry[] | null } | null
	const entries = parsed?.allow ?? []
	if (entries.length === 0) return []

	const unseen = new Map(entries.map(e => [e.event, e]))
	for (const root of scanRoots) {
		if (!existsSync(root)) continue
		for (const file of listFiles(root, ['.ts', '.go'])) {
			if (isTestPath(relative(root, file).split('\\').join('/'))) continue
			const content = readFileSync(file, 'utf8')
			for (const event of [...unseen.keys()]) {
				if (content.includes(event)) unseen.delete(event)
			}
			if (unseen.size === 0) return []
		}
	}
	return [...unseen.values()]
}

// ─── 2. Discipline-rail EXEMPTIONS arrays ───────────────────────────

interface RailContract {
	/** Rail source file (under the rail dir being scanned). */
	rail: string
	/** Entry key naming the exempted target in that rail's EXEMPTIONS array. */
	key: 'file' | 'path'
	/** What the target path is relative to. */
	base: 'src' | 'package'
	/** How the rail matches the entry against scanned paths (tx uses `rel.includes(...)`). */
	match: 'exact' | 'substring'
	/** The pattern the exemption excuses — must still occur in the target, else the entry is a
	 *  fossil. Mirrors the rail's own scan regex; null → the entry's own `call:` regex literal. */
	pattern: RegExp | null
}

const RAIL_CONTRACTS: RailContract[] = [
	{ rail: 'console-discipline.test.ts', key: 'file', base: 'src', match: 'exact', pattern: /console\.(log|error|warn|info|debug)\(/ },
	{ rail: 'probe-discipline.test.ts', key: 'path', base: 'package', match: 'exact', pattern: /resolve\(DrizzleClient\)/ },
	{ rail: 'tx-discipline.test.ts', key: 'file', base: 'src', match: 'substring', pattern: null },
]

interface ExemptionEntry {
	target: string
	call: RegExp | null
	line: number
}

/** Parses `const EXEMPTIONS ... = [ {...}, ... ]` out of a rail's source. Returns null when the
 *  declaration can't be located — the caller treats that as a finding, never as "no entries". */
function exemptionEntries(railSource: string, key: 'file' | 'path'): ExemptionEntry[] | null {
	const { blanked, mask } = sourceViews(railSource)
	const declIdx = mask.search(/const EXEMPTIONS\b/)
	if (declIdx === -1) return null
	const eqIdx = mask.indexOf('=', declIdx)
	if (eqIdx === -1) return null
	const arrOpen = mask.indexOf('[', eqIdx)
	if (arrOpen === -1) return null
	const arrEnd = spanEnd(mask, arrOpen, '[', ']')

	const entries: ExemptionEntry[] = []
	const keyRe = new RegExp(`\\b${key}:\\s*(?:'([^']*)'|"([^"]*)")`)
	let objOpen = mask.indexOf('{', arrOpen + 1)
	while (objOpen !== -1 && objOpen < arrEnd) {
		const objEnd = spanEnd(mask, objOpen, '{', '}')
		const seg = blanked.slice(objOpen, objEnd)
		const target = keyRe.exec(seg)
		const call = /\bcall:\s*\/((?:[^\n/\\]|\\.)+)\/([a-z]*)/.exec(seg)
		if (target) {
			entries.push({
				target: (target[1] ?? target[2]) as string,
				// g/y flags would make .test() stateful across candidate files — strip them.
				call: call ? new RegExp(call[1] as string, (call[2] as string).replace(/[gy]/g, '')) : null,
				line: lineOf(railSource, objOpen),
			})
		}
		objOpen = mask.indexOf('{', objEnd)
	}
	return entries
}

interface DeadExemption {
	rail: string
	line: number
	entry: string
	reason: string
}

function deadRailExemptions(railDir: string, bases: { src: string; package: string }): DeadExemption[] {
	const dead: DeadExemption[] = []
	for (const contract of RAIL_CONTRACTS) {
		const railFile = join(railDir, contract.rail)
		if (!existsSync(railFile)) {
			dead.push({
				rail: contract.rail,
				line: 1,
				entry: '(rail source)',
				reason: 'rail file not found — update RAIL_CONTRACTS if the rail was renamed/moved',
			})
			continue
		}
		const entries = exemptionEntries(readFileSync(railFile, 'utf8'), contract.key)
		if (entries === null) {
			dead.push({
				rail: contract.rail,
				line: 1,
				entry: '(EXEMPTIONS declaration)',
				reason: 'no `const EXEMPTIONS ... = [...]` found — the liveness parse would be checking nothing; realign RAIL_CONTRACTS with the rail',
			})
			continue
		}
		for (const entry of entries) {
			const pattern = contract.pattern ?? entry.call
			if (!pattern) {
				dead.push({ rail: contract.rail, line: entry.line, entry: entry.target, reason: 'entry declares no `call:` regex to prove liveness against' })
				continue
			}
			if (contract.match === 'exact') {
				const target = join(bases[contract.base], entry.target)
				if (!existsSync(target)) {
					dead.push({ rail: contract.rail, line: entry.line, entry: entry.target, reason: 'exempted file no longer exists' })
				} else if (!pattern.test(readFileSync(target, 'utf8'))) {
					dead.push({ rail: contract.rail, line: entry.line, entry: entry.target, reason: `exempted pattern ${String(pattern)} no longer occurs in the file` })
				}
			} else {
				const candidates = existsSync(bases.src)
					? listFiles(bases.src, ['.ts'])
							.filter(f => !f.endsWith('.test.ts'))
							.filter(f => relative(bases.src, f).split('\\').join('/').includes(entry.target))
					: []
				if (candidates.length === 0) {
					dead.push({ rail: contract.rail, line: entry.line, entry: entry.target, reason: 'no production file under src/ matches the exempted path' })
				} else if (!candidates.some(f => pattern.test(readFileSync(f, 'utf8')))) {
					dead.push({ rail: contract.rail, line: entry.line, entry: entry.target, reason: `exempted call ${String(pattern)} no longer occurs in any matching file` })
				}
			}
		}
	}
	return dead
}

// ─── 3. import-direction rule exceptions ────────────────────────────

const IMPORT_DIRECTION_FILE = join(REPO_ROOT, 'scripts', 'detectors', 'import-direction.ts')

/** Mirror of import-direction.ts SCAN_ROOTS (repo-relative) — exceptions are prefixes over the
 *  .ts/.tsx files under these roots. Update in lockstep with the detector. */
const IMPORT_DIRECTION_SCAN_ROOTS = ['packages/api/typescript/src', 'packages/app/react/src']

interface DeadException {
	prefix: string
	line: number
}

function deadImportDirectionExceptions(detectorFile: string, repoRoot: string): DeadException[] {
	const source = readFileSync(detectorFile, 'utf8')
	const { blanked, mask } = sourceViews(source)

	const prefixes: DeadException[] = []
	const arrRe = /exceptions\s*:\s*\[/g
	let m = arrRe.exec(mask)
	while (m) {
		const open = m.index + m[0].length - 1
		const end = spanEnd(mask, open, '[', ']')
		const seg = blanked.slice(open, end)
		for (const lit of seg.matchAll(/'([^']*)'|"([^"]*)"/g)) {
			prefixes.push({ prefix: (lit[1] ?? lit[2]) as string, line: lineOf(source, open + (lit.index as number)) })
		}
		arrRe.lastIndex = end
		m = arrRe.exec(mask)
	}
	if (prefixes.length === 0) return []

	const scanned: string[] = []
	for (const root of IMPORT_DIRECTION_SCAN_ROOTS) {
		const abs = join(repoRoot, root)
		if (!existsSync(abs)) continue
		for (const file of listFiles(abs, ['.ts', '.tsx'])) {
			scanned.push(`${root}/${relative(abs, file).split('\\').join('/')}`)
		}
	}
	return prefixes.filter(p => !scanned.some(f => f.startsWith(p.prefix)))
}

// ─── The rail ───────────────────────────────────────────────────────

describe('allowlist-liveness (every allowlist/exemption entry still matches something real)', () => {
	test('slice-closure.allow.yaml: every allowed wire event still exists in the walked tree', () => {
		const dead = deadAllowEntries(SLICE_ALLOW_FILE, SLICE_SCAN_ROOTS)

		const report = dead.map(e => `  ${e.event}  (reason on file: ${e.reason ?? '—'})`).join('\n')
		expect(
			dead.length,
			`Fossil entr(y/ies) in scripts/detectors/slice-closure.allow.yaml — the wire event no longer ` +
				`exists anywhere slice-closure walks (TS src, contracts wire bindings, Go; tests don't count). ` +
				`A dead entry is a standing permission: re-introduce an event under that name and its ` +
				`missing-consumer/publisher finding is pre-suppressed by a reason written for purged code. ` +
				`Remove the entry (re-add it with a fresh reason if the gap ever becomes intentional again):\n${report}`,
		).toBe(0)
	})

	test('discipline rails: every EXEMPTIONS entry names an existing file that still contains the exempted pattern', () => {
		const dead = deadRailExemptions(import.meta.dir, { src: API_SRC, package: API_ROOT })

		const report = dead.map(d => `  ${d.rail}:${d.line}  ${d.entry}  →  ${d.reason}`).join('\n')
		expect(
			dead.length,
			`Fossil EXEMPTIONS entr(y/ies) — the file is gone, or it no longer contains the pattern the ` +
				`exemption excuses. A dead exemption is a pre-approved hole: the next offender at that path ` +
				`inherits a why written for code that no longer exists. Remove the entry from the rail's ` +
				`EXEMPTIONS array (never keep it "just in case" — re-add with a fresh why when needed):\n${report}`,
		).toBe(0)
	})

	test('import-direction: every rule exception prefix still matches at least one scanned file', () => {
		const dead = deadImportDirectionExceptions(IMPORT_DIRECTION_FILE, REPO_ROOT)

		const report = dead.map(d => `  scripts/detectors/import-direction.ts:${d.line}  ${d.prefix}`).join('\n')
		expect(
			dead.length,
			`Fossil exception prefix(es) in scripts/detectors/import-direction.ts — no scanned file starts ` +
				`with the prefix, so the exception suppresses nothing today and silently pre-suppresses any ` +
				`future file recreated at that path. Remove the prefix from the rule's exceptions array ` +
				`(re-add it with a fresh justification if the deviation ever returns):\n${report}`,
		).toBe(0)
	})

	// Negative fixtures — temp dirs (molde `console-discipline.test.ts`), so the scans are proven to
	// catch offenders even while the real tree is clean.

	test('fixture: an allow entry whose event survives only in a test file is flagged; a live one is not', () => {
		const tmpRoot = mkdtempSync(join(tmpdir(), 'allowlist-liveness-yaml-'))
		try {
			const treeDir = join(tmpRoot, 'src', 'billing', 'handlers')
			mkdirSync(treeDir, { recursive: true })
			writeFileSync(join(treeDir, 'internal.ts'), "export const LIVE = 'integration.shared.subscription.changed'\n")
			// The dead event's only survivor is a test file — slice-closure never walks tests, so the
			// entry can never suppress a finding again and must be flagged.
			writeFileSync(join(treeDir, 'internal.test.ts'), "export const GHOST = 'integration.shared.ghost.updated'\n")

			const allowFile = join(tmpRoot, 'allow.yaml')
			writeFileSync(
				allowFile,
				[
					'allow:',
					'  - event: integration.shared.subscription.changed',
					'    rule: SCW-01c',
					'    reason: live — still declared in the tree',
					'  - event: integration.shared.ghost.updated',
					'    rule: SCW-01c',
					'    reason: fossil — event purged',
					'',
				].join('\n'),
			)

			const dead = deadAllowEntries(allowFile, [join(tmpRoot, 'src')])
			expect(dead.map(e => e.event)).toEqual(['integration.shared.ghost.updated'])
		} finally {
			rmSync(tmpRoot, { recursive: true, force: true })
		}
	})

	test('fixture: EXEMPTIONS entries for a deleted file, a migrated pattern, and a stale call regex are flagged; live ones are not', () => {
		const tmpRoot = mkdtempSync(join(tmpdir(), 'allowlist-liveness-rails-'))
		try {
			const railDir = join(tmpRoot, 'rails')
			const srcRoot = join(tmpRoot, 'src')
			const pkgRoot = join(tmpRoot, 'pkg')
			mkdirSync(railDir, { recursive: true })
			mkdirSync(join(srcRoot, 'auth'), { recursive: true })
			mkdirSync(join(srcRoot, 'billing', 'usecases'), { recursive: true })
			mkdirSync(join(pkgRoot, 'tests', 'kernel'), { recursive: true })

			// Targets: index.ts still consoles (live); Migrated.ts lost its console call (dead);
			// ghost/Gone.ts does not exist (dead).
			writeFileSync(join(srcRoot, 'index.ts'), "console.log('boot')\n")
			writeFileSync(join(srcRoot, 'auth', 'Migrated.ts'), 'export const clean = true\n')
			writeFileSync(
				join(railDir, 'console-discipline.test.ts'),
				[
					'const EXEMPTIONS: { file: string; why: string }[] = [',
					"\t// a comment inside the array (even one naming file: 'nope.ts') must not become an entry",
					"\t{ file: 'index.ts', why: 'bootstrap' },",
					"\t{ file: 'ghost/Gone.ts', why: 'the file this excused was deleted' },",
					"\t{ file: 'auth/Migrated.ts', why: 'the console call this excused was migrated' },",
					']',
					'',
				].join('\n'),
			)

			// Probe: Live.test.ts still resolves the client (live); Gone.test.ts is deleted (dead).
			writeFileSync(join(pkgRoot, 'tests', 'kernel', 'Live.test.ts'), 'const db = testBed.resolve(DrizzleClient)\n')
			writeFileSync(
				join(railDir, 'probe-discipline.test.ts'),
				[
					'const EXEMPTIONS: { path: string; why: string }[] = [',
					"\t{ path: 'tests/kernel/Live.test.ts', why: 'the DB is the subject' },",
					"\t{ path: 'tests/kernel/Gone.test.ts', why: 'deleted since' },",
					']',
					'',
				].join('\n'),
			)

			// Tx: Charge.ts still contains the exempted call (live); Refund.ts exists but the call the
			// entry excuses was refactored away (dead — proves the `call:` regex path, substring match).
			writeFileSync(join(srcRoot, 'billing', 'usecases', 'Charge.ts'), 'await this.legacy.fire(tx)\n')
			writeFileSync(join(srcRoot, 'billing', 'usecases', 'Refund.ts'), 'await this.email.queue(tx)\n')
			writeFileSync(
				join(railDir, 'tx-discipline.test.ts'),
				String.raw`const EXEMPTIONS: { file: string; call: RegExp; why: string }[] = [
	{ file: 'billing/usecases/Charge.ts', call: /this\.legacy\.fire\(/, why: 'pending migration' },
	{ file: 'billing/usecases/Refund.ts', call: /this\.mailer\.send\(/, why: 'call refactored away' },
]
`,
			)

			const dead = deadRailExemptions(railDir, { src: srcRoot, package: pkgRoot })
			expect(dead.map(d => `${d.rail} :: ${d.entry}`).sort()).toEqual([
				'console-discipline.test.ts :: auth/Migrated.ts',
				'console-discipline.test.ts :: ghost/Gone.ts',
				'probe-discipline.test.ts :: tests/kernel/Gone.test.ts',
				'tx-discipline.test.ts :: billing/usecases/Refund.ts',
			])
		} finally {
			rmSync(tmpRoot, { recursive: true, force: true })
		}
	})

	test('fixture: an exception prefix matching no scanned file is flagged; a live directory prefix is not', () => {
		const tmpRoot = mkdtempSync(join(tmpdir(), 'allowlist-liveness-importdir-'))
		try {
			const storybookDir = join(tmpRoot, 'packages', 'app', 'react', 'src', 'storybook')
			mkdirSync(storybookDir, { recursive: true })
			writeFileSync(join(storybookDir, 'mock.ts'), 'export const mock = true\n')

			const detectorFile = join(tmpRoot, 'import-direction.ts')
			writeFileSync(
				detectorFile,
				[
					'const RULES = [',
					'\t{',
					'\t\texceptions: [',
					'\t\t\t// dead — the excused stub was deleted',
					"\t\t\t'packages/api/typescript/src/billing/usecases/Dead.ts',",
					"\t\t\t'packages/app/react/src/storybook/',",
					'\t\t],',
					'\t},',
					'\t{ exceptions: [] },',
					']',
					'',
				].join('\n'),
			)

			const dead = deadImportDirectionExceptions(detectorFile, tmpRoot)
			expect(dead.map(d => d.prefix)).toEqual(['packages/api/typescript/src/billing/usecases/Dead.ts'])
		} finally {
			rmSync(tmpRoot, { recursive: true, force: true })
		}
	})
})
