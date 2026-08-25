/**
 * sync.test.ts — the pull-based sync machinery against a FABRICATED parent/child repo pair
 * in temp dirs (mold: examples/promote.test.ts fixtures). Parent gets three commits; the
 * child is initialized from commit 1 with a sync.yaml pinning it. SYNC_PARENT_PATH (passed
 * as the parentPath option, plus one env-wiring test) keeps every test off the network.
 *
 * Proves: teaching contract errors (negative fixtures) · clean check at pin · drift after
 * the pin advances past the tree (and after a local edit) · adapted liveness (fossil +
 * missing fail) · pull advances the pin and applies changes · conflicts abort atomically ·
 * root-repo no-op.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { syncCheck } from './check'
import { SyncContractError, loadManifest, parseManifest } from './contract'
import { syncPull } from './pull'

let root: string
let parentRepo: string
let child: string
let sha1: string
let sha2: string
let sha3: string

const PARENT_ONE_V1 = 'export const one = 1\n'
const PARENT_ONE_V2 = 'export const one = 100\n'
const PARENT_GUIDE_V1 = '# guide\nparent text\n'
const CHILD_GUIDE = '# guide\nchild-adapted text\n'

function write(repo: string, relPath: string, content: string): void {
	const file = join(repo, relPath)
	mkdirSync(dirname(file), { recursive: true })
	writeFileSync(file, content)
}

function git(repo: string, ...args: string[]): string {
	return execFileSync('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@test', '-C', repo, ...args])
		.toString('utf8')
		.trim()
}

const manifestYaml = (ref: string) => `# the child's declaration of its parent
parent:
  repo: ${parentRepo}
  ref: ${ref}
inherited:
  - scripts/lib/**
adapted:
  - path: docs/guide.md
    why: child rewrote the guide for its own domain
`

const setPin = (ref: string) => write(child, 'sync.yaml', manifestYaml(ref))

beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), 'sync-fixture-'))
	parentRepo = join(root, 'parent')
	child = join(root, 'child')
	mkdirSync(parentRepo, { recursive: true })
	mkdirSync(child, { recursive: true })

	// Parent: commit 1 = the pinned base the child forked from.
	git(parentRepo, 'init', '-q')
	write(parentRepo, 'scripts/lib/one.ts', PARENT_ONE_V1)
	write(parentRepo, 'scripts/lib/two.ts', 'export const two = 2\n')
	write(parentRepo, 'docs/guide.md', PARENT_GUIDE_V1)
	write(parentRepo, 'README.md', '# parent\n')
	git(parentRepo, 'add', '-A')
	git(parentRepo, 'commit', '-qm', 'commit 1')
	sha1 = git(parentRepo, 'rev-parse', 'HEAD')

	// Commit 2: modify + add + delete on the surface, plus an OFF-surface edit.
	write(parentRepo, 'scripts/lib/one.ts', PARENT_ONE_V2)
	write(parentRepo, 'scripts/lib/three.ts', 'export const three = 3\n')
	rmSync(join(parentRepo, 'scripts/lib/two.ts'))
	write(parentRepo, 'README.md', '# parent v2\n')
	git(parentRepo, 'add', '-A')
	git(parentRepo, 'commit', '-qm', 'commit 2')
	sha2 = git(parentRepo, 'rev-parse', 'HEAD')

	// Commit 3: touches ONLY the file the child adapted → the pull-conflict case.
	write(parentRepo, 'docs/guide.md', '# guide\nparent text v3\n')
	git(parentRepo, 'add', '-A')
	git(parentRepo, 'commit', '-qm', 'commit 3')
	sha3 = git(parentRepo, 'rev-parse', 'HEAD')

	// Child: forked from commit 1 — inherited surface verbatim, guide.md deliberately
	// diverged (adapted), plus owned files the tool must never touch.
	git(child, 'init', '-q')
	write(child, 'scripts/lib/one.ts', PARENT_ONE_V1)
	write(child, 'scripts/lib/two.ts', 'export const two = 2\n')
	write(child, 'docs/guide.md', CHILD_GUIDE)
	write(child, 'src/app.ts', 'export const app = true\n')
	write(child, 'README.md', '# child\n')
	setPin(sha1)
	git(child, 'add', '-A')
	git(child, 'commit', '-qm', 'fork from commit 1')
})

afterAll(() => {
	rmSync(root, { recursive: true, force: true })
})

const check = () => syncCheck({ childRoot: child, parentPath: parentRepo, log: () => {} })
const pull = (opts: { to?: string; dryRun?: boolean } = {}) =>
	syncPull({ childRoot: child, parentPath: parentRepo, log: () => {}, ...opts })

// ─── Contract (negative fixtures — teaching errors) ─────────────────

describe('contract', () => {
	it('parses a valid manifest into the typed shape', () => {
		const manifest = parseManifest(manifestYaml(sha1))
		expect(manifest.parent).toEqual({ repo: parentRepo, ref: sha1 })
		expect(manifest.inherited).toEqual(['scripts/lib/**'])
		expect(manifest.adapted).toEqual([{ path: 'docs/guide.md', why: 'child rewrote the guide for its own domain' }])
	})

	it('rejects a branch name as the pin — teaches that pins are full shas', () => {
		expect(() => parseManifest(`parent:\n  repo: x\n  ref: main\n`)).toThrow(/full 40-char commit sha.*moving target/s)
	})

	it('rejects a missing parent mapping', () => {
		expect(() => parseManifest('inherited: []\n')).toThrow(/'parent' must be a mapping/)
	})

	it('rejects an adapted entry without a why — undocumented divergence is just drift', () => {
		expect(() => parseManifest(`parent:\n  repo: x\n  ref: ${sha1}\nadapted:\n  - path: docs/guide.md\n`)).toThrow(/why is mandatory/)
	})

	it('rejects a glob as an adapted path — liveness is per exact file', () => {
		expect(() => parseManifest(`parent:\n  repo: x\n  ref: ${sha1}\nadapted:\n  - path: docs/**\n    why: nope\n`)).toThrow(
			/exact file, not a glob/,
		)
	})

	it('rejects unknown top-level keys — a path outside every glob needs no key at all', () => {
		expect(() => parseManifest(`parent:\n  repo: x\n  ref: ${sha1}\nignored:\n  - src/**\n`)).toThrow(/unknown top-level key 'ignored'/)
	})

	it('accepts owned entries — globs allowed (an owned area is an area), why mandatory', () => {
		const manifest = parseManifest(
			`parent:\n  repo: x\n  ref: ${sha1}\ninherited:\n  - scripts/**\nowned:\n  - path: scripts/detectors/*.baseline.json\n    why: the ratchet is this repo's\n`,
		)
		expect(manifest.owned).toEqual([{ path: 'scripts/detectors/*.baseline.json', why: "the ratchet is this repo's" }])
	})

	it('rejects an owned entry without a why — an undeclared carve-out is a glob drawn too wide', () => {
		expect(() => parseManifest(`parent:\n  repo: x\n  ref: ${sha1}\nowned:\n  - path: scripts/x.json\n`)).toThrow(
			/owned\[0\]\.why is mandatory/,
		)
	})

	it('rejects absolute and escaping paths', () => {
		expect(() => parseManifest(`parent:\n  repo: x\n  ref: ${sha1}\ninherited:\n  - /etc/passwd\n`)).toThrow(/repo-relative/)
		expect(() => parseManifest(`parent:\n  repo: x\n  ref: ${sha1}\ninherited:\n  - ../outside/**\n`)).toThrow(/inside the repo/)
	})

	it('errors are SyncContractError and carry the expected shape', () => {
		try {
			parseManifest('42\n')
			throw new Error('unreachable')
		} catch (err) {
			expect(err).toBeInstanceOf(SyncContractError)
			expect((err as Error).message).toContain('Expected shape:')
		}
	})

	it('loadManifest returns null when sync.yaml is absent (root repo)', () => {
		expect(loadManifest(parentRepo)).toBeNull()
	})
})

// ─── The drift gate ─────────────────────────────────────────────────

describe('sync:check', () => {
	it('is clean at the pin: surface matches, adapted entry is live', () => {
		const result = check()
		expect(result.status).toBe('clean')
		expect(result.failures).toEqual([])
		expect(result.checked).toBe(3) // one.ts + two.ts + the adapted guide.md
	})

	it('reads the parent from SYNC_PARENT_PATH when no option is passed (offline wiring)', () => {
		const previous = process.env.SYNC_PARENT_PATH
		process.env.SYNC_PARENT_PATH = parentRepo
		try {
			expect(syncCheck({ childRoot: child, log: () => {} }).status).toBe('clean')
		} finally {
			if (previous === undefined) delete process.env.SYNC_PARENT_PATH
			else process.env.SYNC_PARENT_PATH = previous
		}
	})

	it('names a locally edited inherited file as drift, with the three-move fix menu', () => {
		write(child, 'scripts/lib/one.ts', `${PARENT_ONE_V1}// local tweak\n`)
		const result = check()
		expect(result.status).toBe('drift')
		expect(result.failures).toHaveLength(1)
		const failure = result.failures[0]
		expect(failure?.kind).toBe('drift-modified')
		expect(failure?.path).toBe('scripts/lib/one.ts')
		expect(failure?.menu.join(' ')).toMatch(/re-pull.*reclassify to adapted.*upstream/s)
		write(child, 'scripts/lib/one.ts', PARENT_ONE_V1)
	})

	it('detects drift when the pin advances past the tree (parent commit 2, no pull): modified + missing + child-only', () => {
		setPin(sha2)
		const result = check()
		expect(result.status).toBe('drift')
		const byPath = new Map(result.failures.map(f => [f.path, f.kind]))
		expect(byPath.get('scripts/lib/one.ts')).toBe('drift-modified')
		expect(byPath.get('scripts/lib/three.ts')).toBe('drift-missing')
		expect(byPath.get('scripts/lib/two.ts')).toBe('drift-child-only')
		setPin(sha1)
	})

	it('fails a FOSSIL adapted entry — the file matches the parent again', () => {
		write(child, 'docs/guide.md', PARENT_GUIDE_V1)
		const result = check()
		expect(result.status).toBe('drift')
		expect(result.failures).toHaveLength(1)
		expect(result.failures[0]?.kind).toBe('adapted-fossil')
		expect(result.failures[0]?.detail).toContain('fossil')
		expect(result.failures[0]?.menu.join(' ')).toContain('inherited')
		write(child, 'docs/guide.md', CHILD_GUIDE)
	})

	it('fails an adapted entry whose file the child no longer has', () => {
		rmSync(join(child, 'docs/guide.md'))
		const result = check()
		expect(result.status).toBe('drift')
		expect(result.failures[0]?.kind).toBe('adapted-missing')
		write(child, 'docs/guide.md', CHILD_GUIDE)
	})

	it('no-ops green on a root repo (no sync.yaml) — how the template itself stays green', () => {
		const rootRepo = join(root, 'plain-root')
		mkdirSync(rootRepo, { recursive: true })
		const lines: string[] = []
		const result = syncCheck({ childRoot: rootRepo, log: line => lines.push(line) })
		expect(result.status).toBe('root')
		expect(result.failures).toEqual([])
		expect(lines.join('\n')).toContain('root repo, nothing to check')
	})
})

// ─── The pull ───────────────────────────────────────────────────────

describe('sync:pull', () => {
	it('refuses to pull over local drift — named conflict, nothing applied, pin untouched', () => {
		write(child, 'scripts/lib/two.ts', 'export const two = 2 // drifted\n')
		const result = pull({ to: sha2 })
		expect(result.status).toBe('conflict')
		expect(result.conflicts.map(c => c.path)).toEqual(['scripts/lib/two.ts'])
		expect(result.conflicts[0]?.reason).toContain('sync:check')
		expect(readFileSync(join(child, 'scripts/lib/one.ts'), 'utf8')).toBe(PARENT_ONE_V1) // untouched
		expect(loadManifest(child)?.parent.ref).toBe(sha1)
		write(child, 'scripts/lib/two.ts', 'export const two = 2\n')
	})

	it('--dry-run lists the surface changes (never the off-surface ones) and writes nothing', () => {
		const result = pull({ to: sha2, dryRun: true })
		expect(result.status).toBe('dry-run')
		expect(result.changes.map(c => `${c.action} ${c.path}`).sort()).toEqual([
			'add scripts/lib/three.ts',
			'delete scripts/lib/two.ts',
			'modify scripts/lib/one.ts',
		])
		expect(readFileSync(join(child, 'scripts/lib/one.ts'), 'utf8')).toBe(PARENT_ONE_V1)
		expect(existsSync(join(child, 'scripts/lib/two.ts'))).toBe(true)
		expect(loadManifest(child)?.parent.ref).toBe(sha1)
	})

	it('applies the parent changes, advances the pin, and leaves owned + adapted files alone', () => {
		const result = pull({ to: sha2 })
		expect(result.status).toBe('applied')
		expect(result.fromRef).toBe(sha1)
		expect(result.toRef).toBe(sha2)
		expect(readFileSync(join(child, 'scripts/lib/one.ts'), 'utf8')).toBe(PARENT_ONE_V2)
		expect(readFileSync(join(child, 'scripts/lib/three.ts'), 'utf8')).toBe('export const three = 3\n')
		expect(existsSync(join(child, 'scripts/lib/two.ts'))).toBe(false)
		expect(readFileSync(join(child, 'README.md'), 'utf8')).toBe('# child\n') // owned — off surface
		expect(readFileSync(join(child, 'docs/guide.md'), 'utf8')).toBe(CHILD_GUIDE) // adapted — untouched
		expect(loadManifest(child)?.parent.ref).toBe(sha2)
		// The rewrite goes through the YAML document API — comments survive.
		expect(readFileSync(join(child, 'sync.yaml'), 'utf8')).toContain("# the child's declaration of its parent")
		expect(check().status).toBe('clean') // the pulled tree is check-clean at the new pin
	})

	it('is a noop when already at the target pin', () => {
		expect(pull({ to: sha2 }).status).toBe('noop')
	})

	it('conflicts when the parent changes a file the child adapted — merge stays a human decision', () => {
		const result = pull({ to: sha3 })
		expect(result.status).toBe('conflict')
		expect(result.conflicts.map(c => c.path)).toEqual(['docs/guide.md'])
		expect(result.conflicts[0]?.reason).toContain('adapted')
		expect(readFileSync(join(child, 'docs/guide.md'), 'utf8')).toBe(CHILD_GUIDE)
		expect(loadManifest(child)?.parent.ref).toBe(sha2)
	})

	it('no-ops green on a root repo (no sync.yaml)', () => {
		const rootRepo = join(root, 'plain-root-pull')
		mkdirSync(rootRepo, { recursive: true })
		const lines: string[] = []
		expect(syncPull({ childRoot: rootRepo, log: line => lines.push(line) }).status).toBe('root')
		expect(lines.join('\n')).toContain('root repo, nothing to pull')
	})
})

// ─── Convergence: the conflict test is about CONTENT, not pertinence ─
//
// mira#42, reincident on the 2nd real pull: `adapted` + the parent moved = CONFLICT with no
// exit. Hand-merging the file byte-for-byte to the parent's new content still reported
// CONFLICT, because the old test asked "is this path adapted?" instead of "is this path
// already where I am taking it?". These three cases pin the new rule in both directions.

describe('sync:pull — convergência (idempotência sem flag)', () => {
	let p: string
	let c: string
	let base: string
	let head: string

	const yaml = (ref: string) =>
		`parent:\n  repo: ${p}\n  ref: ${ref}\ninherited:\n  - lib/**\nadapted:\n  - path: doc.md\n    why: child rewrote it\n`

	beforeAll(() => {
		p = join(root, 'conv-parent')
		c = join(root, 'conv-child')
		mkdirSync(p, { recursive: true })
		mkdirSync(c, { recursive: true })
		git(p, 'init', '-q')
		write(p, 'lib/a.ts', 'export const a = 1\n')
		write(p, 'doc.md', '# parent v1\n')
		git(p, 'add', '-A')
		git(p, 'commit', '-qm', 'base')
		base = git(p, 'rev-parse', 'HEAD')
		write(p, 'lib/a.ts', 'export const a = 2\n')
		write(p, 'doc.md', '# parent v2\n')
		git(p, 'add', '-A')
		git(p, 'commit', '-qm', 'head')
		head = git(p, 'rev-parse', 'HEAD')

		git(c, 'init', '-q')
		write(c, 'lib/a.ts', 'export const a = 1\n')
		write(c, 'doc.md', '# child fork\n')
		write(c, 'sync.yaml', yaml(base))
		git(c, 'add', '-A')
		git(c, 'commit', '-qm', 'fork')
	})

	const convPull = () => syncPull({ childRoot: c, parentPath: p, to: head, log: () => {} })

	it('adapted + parent moved + child DIVERGES from both pins → still CONFLICT, named', () => {
		const result = convPull()
		expect(result.status).toBe('conflict')
		expect(result.conflicts.map(x => x.path)).toEqual(['doc.md'])
		expect(result.conflicts[0]?.reason).toContain('adapted')
		expect(result.converged).toEqual([])
		expect(loadManifest(c)?.parent.ref).toBe(base) // pin untouched
	})

	it('adapted hand-merged to the parent BYTE-FOR-BYTE → converged, the pull carries on', () => {
		write(c, 'doc.md', '# parent v2\n') // the hand-merge mira#42 said had no exit
		const result = convPull()
		expect(result.status).toBe('applied')
		expect(result.conflicts).toEqual([])
		expect(result.converged.map(x => x.path)).toEqual(['doc.md'])
		expect(result.changes.map(x => x.path)).toEqual(['lib/a.ts'])
		expect(readFileSync(join(c, 'lib/a.ts'), 'utf8')).toBe('export const a = 2\n')
		expect(loadManifest(c)?.parent.ref).toBe(head)
	})

	it('the converged adapted entry is then a FOSSIL — sync:check is where that verdict belongs', () => {
		const result = syncCheck({ childRoot: c, parentPath: p, log: () => {} })
		expect(result.status).toBe('drift')
		expect(result.failures.map(f => f.kind)).toEqual(['adapted-fossil'])
		expect(result.failures[0]?.path).toBe('doc.md')
	})

	it('inherited local drift that COINCIDES with the target → converged, nothing rewritten', () => {
		// Rewind the pin and pre-apply the parent's change by hand: the child is already there.
		write(c, 'sync.yaml', yaml(base))
		write(c, 'doc.md', '# child fork\n') // put the divergence back so the entry is live again
		write(c, 'lib/a.ts', 'export const a = 2\n') // "drift" that happens to BE the target
		const result = syncPull({ childRoot: c, parentPath: p, to: head, log: () => {} })
		expect(result.status).toBe('conflict') // doc.md still diverges — that half is untouched
		expect(result.conflicts.map(x => x.path)).toEqual(['doc.md'])
		expect(result.converged.map(x => x.path)).toEqual(['lib/a.ts']) // NOT a conflict any more
	})
})

// ─── The boundary warning ───────────────────────────────────────────
//
// mira#43, confirmed on the 2nd real pull: a parent commit that touches BOTH the inherited
// surface and the product's side lands HALF-APPLIED, and the pull said "applied 19", exit 0,
// with `sync:check` clean and `bun test` broken. The half that entered is correct; the
// silence was the defect. Classification is by COMMIT because that is the unit the author
// made coherent.

describe('sync:pull — aviso de fronteira', () => {
	let p: string
	let c: string
	let base: string
	let crossing: string

	beforeAll(() => {
		p = join(root, 'bound-parent')
		c = join(root, 'bound-child')
		mkdirSync(p, { recursive: true })
		mkdirSync(c, { recursive: true })
		git(p, 'init', '-q')
		write(p, 'lib/rail.ts', 'export const rail = 1\n')
		write(p, 'app/screen.tsx', 'export const screen = 1\n')
		git(p, 'add', '-A')
		git(p, 'commit', '-qm', 'base')
		base = git(p, 'rev-parse', 'HEAD')

		// A commit ENTIRELY inside the surface — must produce no warning.
		write(p, 'lib/rail.ts', 'export const rail = 2\n')
		git(p, 'add', '-A')
		git(p, 'commit', '-qm', 'inside only')

		// THE crossing commit: one half rides the train, the other is the product's.
		write(p, 'lib/rail.ts', 'export const rail = 3\n')
		write(p, 'app/screen.tsx', 'export const screen = 2\n')
		git(p, 'add', '-A')
		git(p, 'commit', '-qm', 'feat(rail): ENV-06 rail + the half that matters')
		crossing = git(p, 'rev-parse', 'HEAD')

		git(c, 'init', '-q')
		write(c, 'lib/rail.ts', 'export const rail = 1\n')
		write(c, 'app/screen.tsx', 'export const screen = 1\n')
		write(c, 'sync.yaml', `parent:\n  repo: ${p}\n  ref: ${base}\ninherited:\n  - lib/**\n`)
		git(c, 'add', '-A')
		git(c, 'commit', '-qm', 'fork')
	})

	it('names the files that stayed behind, and only for the commit that crosses', () => {
		const lines: string[] = []
		const result = syncPull({ childRoot: c, parentPath: p, log: line => lines.push(line) })
		expect(result.status).toBe('applied')
		expect(result.boundaryWarnings).toHaveLength(1) // the "inside only" commit says nothing
		const warning = result.boundaryWarnings[0]!
		expect(warning.commit).toBe(crossing)
		expect(warning.subject).toBe('feat(rail): ENV-06 rail + the half that matters')
		expect(warning.inside).toEqual(['lib/rail.ts'])
		expect(warning.outside).toEqual(['app/screen.tsx'])
		// The half that rides still rides — the warning is a report, never an abort.
		expect(readFileSync(join(c, 'lib/rail.ts'), 'utf8')).toBe('export const rail = 3\n')
		expect(readFileSync(join(c, 'app/screen.tsx'), 'utf8')).toBe('export const screen = 1\n')
		const output = lines.join('\n')
		expect(output).toContain('crosses the surface boundary')
		expect(output).toContain('outside: app/screen.tsx')
	})
})

// ─── owned: + the sidecar — the pull stops erasing child data ───────
//
// mira#44, the most systemic of the train: "o pull APAGA dado do filho em silêncio — 5
// ocorrências (EXEMPTIONS, HISTORY, CONTEXT_DECLS, QuotaKey plugado, marcadores reference)".
// All five are one shape: an inherited file hosts a list that varies per product. The fix is
// two-sided — the DATA moves to a sidecar (scripts/lib/sidecar.ts), and the sidecar is
// declared `owned:` so the surface stops claiming it.

describe('sync — owned: e o sidecar (dado do filho sob glob herdado)', () => {
	let p: string
	let c: string
	let base: string
	let head: string
	const SIDECAR = 'rails/console-discipline.local.yaml'
	const CHILD_DATA = "entries:\n  - file: desk/Feed.ts\n    why: this product's own console bottom\n"

	const yaml = (ref: string, owned: boolean) =>
		`parent:\n  repo: ${p}\n  ref: ${ref}\ninherited:\n  - rails/**\n` +
		(owned ? `owned:\n  - path: rails/*.local.yaml\n    why: the exemptions of THIS product; the parent has no opinion on them\n` : '')

	beforeAll(() => {
		p = join(root, 'owned-parent')
		c = join(root, 'owned-child')
		mkdirSync(p, { recursive: true })
		mkdirSync(c, { recursive: true })
		git(p, 'init', '-q')
		write(p, 'rails/console-discipline.test.ts', 'const EXEMPTIONS = [] // v1\n')
		git(p, 'add', '-A')
		git(p, 'commit', '-qm', 'base')
		base = git(p, 'rev-parse', 'HEAD')
		write(p, 'rails/console-discipline.test.ts', 'const EXEMPTIONS = [] // v2 — parent rewrote it\n')
		git(p, 'add', '-A')
		git(p, 'commit', '-qm', 'parent rewrites the rail')
		head = git(p, 'rev-parse', 'HEAD')

		git(c, 'init', '-q')
		write(c, 'rails/console-discipline.test.ts', 'const EXEMPTIONS = [] // v1\n')
		write(c, SIDECAR, CHILD_DATA)
		write(c, 'sync.yaml', yaml(base, true))
		git(c, 'add', '-A')
		git(c, 'commit', '-qm', 'fork with a sidecar')
	})

	it('sem owned: o sidecar é drift-child-only — o gate reclamando é o defeito de ronda#19', () => {
		write(c, 'sync.yaml', yaml(base, false))
		const result = syncCheck({ childRoot: c, parentPath: p, log: () => {} })
		expect(result.status).toBe('drift')
		expect(result.failures.map(f => f.kind)).toEqual(['drift-child-only'])
		expect(result.failures[0]?.path).toBe(SIDECAR)
		write(c, 'sync.yaml', yaml(base, true))
	})

	it('com owned: o check fica limpo e o pull reescreve o arquivo do PAI sem tocar no sidecar', () => {
		expect(syncCheck({ childRoot: c, parentPath: p, log: () => {} }).status).toBe('clean')

		const result = syncPull({ childRoot: c, parentPath: p, to: head, log: () => {} })
		expect(result.status).toBe('applied')
		expect(result.changes.map(x => x.path)).toEqual(['rails/console-discipline.test.ts'])

		// The parent's file moved…
		expect(readFileSync(join(c, 'rails/console-discipline.test.ts'), 'utf8')).toContain('v2 — parent rewrote it')
		// …and the child's 1 row is byte-identical. This is AC-5.
		expect(readFileSync(join(c, SIDECAR), 'utf8')).toBe(CHILD_DATA)
		expect(syncCheck({ childRoot: c, parentPath: p, log: () => {} }).status).toBe('clean')
	})

	it('owned que o PAI tem é mentira de proveniência — falha nomeando as duas saídas', () => {
		write(
			c,
			'sync.yaml',
			`${yaml(head, true)}  - path: rails/console-discipline.test.ts\n    why: wrong word for a file that came from the parent\n`,
		)
		const result = syncCheck({ childRoot: c, parentPath: p, log: () => {} })
		expect(result.failures.map(f => f.kind)).toContain('owned-in-parent')
		const failure = result.failures.find(f => f.kind === 'owned-in-parent')!
		expect(failure.detail).toContain('rails/console-discipline.test.ts')
		expect(failure.menu.join(' ')).toContain('reclassify to adapted')
		write(c, 'sync.yaml', yaml(head, true))
	})

	it('owned que não casa com nada é buraco sem arquivo — falha nomeando', () => {
		write(c, 'sync.yaml', `${yaml(head, true)}  - path: rails/nothing-here.yaml\n    why: stale carve-out\n`)
		const result = syncCheck({ childRoot: c, parentPath: p, log: () => {} })
		expect(result.failures.map(f => f.kind)).toContain('owned-empty')
		write(c, 'sync.yaml', yaml(head, true))
	})
})

// ─── except: — a poda declarada em vez de dodgeada (AC-9) ───────────
//
// mira#16 / ronda#28 ("a TERCEIRA vez que a mesma tesoura é necessária"): pruning language
// tooling that lives UNDER a tier-1 glob produced a child that was correct and UNENROLLABLE —
// 72 DRIFT-MISSING, all of them the pruned paths. `narrowSurfaces` answered by rewriting the
// broad glob into an enumeration of survivors, at a documented permanent cost: a file the
// parent adds to a narrowed level is never inherited again. `except:` answers in the contract.

describe('sync — canal except:', () => {
	let p: string
	let c: string
	let base: string

	const yaml = (withExcept: boolean) =>
		`parent:\n  repo: ${p}\n  ref: ${base}\ninherited:\n  - tooling/**\n` +
		(withExcept
			? `except:\n  - path: tooling/expo/**\n    why: this product has no expo app; we never took it, so the parent's copy is not drift\n`
			: '')

	beforeAll(() => {
		p = join(root, 'except-parent')
		c = join(root, 'except-child')
		mkdirSync(p, { recursive: true })
		mkdirSync(c, { recursive: true })
		git(p, 'init', '-q')
		write(p, 'tooling/shared.ts', 'export const shared = 1\n')
		write(p, 'tooling/expo/route.ts', 'export const expoRoute = 1\n')
		write(p, 'tooling/expo/form.ts', 'export const expoForm = 1\n')
		git(p, 'add', '-A')
		git(p, 'commit', '-qm', 'parent has expo tooling')
		base = git(p, 'rev-parse', 'HEAD')

		// The child is a stamp WITHOUT expo: the two expo files were pruned.
		git(c, 'init', '-q')
		write(c, 'tooling/shared.ts', 'export const shared = 1\n')
		write(c, 'sync.yaml', yaml(true))
		git(c, 'add', '-A')
		git(c, 'commit', '-qm', 'stamped without expo')
	})

	it('SEM except: a matrícula é impossível — DRIFT-MISSING nos exatos paths podados', () => {
		write(c, 'sync.yaml', yaml(false))
		const result = syncCheck({ childRoot: c, parentPath: p, log: () => {} })
		expect(result.status).toBe('drift')
		expect(result.failures.map(f => f.kind)).toEqual(['drift-missing', 'drift-missing'])
		expect(result.failures.map(f => f.path).sort()).toEqual(['tooling/expo/form.ts', 'tooling/expo/route.ts'])
		write(c, 'sync.yaml', yaml(true))
	})

	it('COM except: a matrícula fica limpa e o glob largo CONTINUA largo', () => {
		expect(syncCheck({ childRoot: c, parentPath: p, log: () => {} }).status).toBe('clean')
		// The whole point vs narrowSurfaces: `tooling/**` was never rewritten, so a file the parent
		// adds OUTSIDE the excepted area still arrives as inheritance.
		expect(loadManifest(c)?.inherited).toEqual(['tooling/**'])

		write(p, 'tooling/brand-new.ts', 'export const brandNew = 1\n')
		git(p, 'add', '-A')
		git(p, 'commit', '-qm', 'parent adds a file the child must inherit')
		const head = git(p, 'rev-parse', 'HEAD')
		const pull = syncPull({ childRoot: c, parentPath: p, to: head, log: () => {} })
		expect(pull.status).toBe('applied')
		expect(
			pull.changes.map(x => x.path),
			'the new file rides; the excepted ones do not',
		).toEqual(['tooling/brand-new.ts'])
	})

	it('except que não casa nada no pai é fóssil — o buraco permanente tem rail', () => {
		const current = loadManifest(c)!.parent.ref
		write(
			c,
			'sync.yaml',
			`parent:\n  repo: ${p}\n  ref: ${current}\ninherited:\n  - tooling/**\nexcept:\n  - path: tooling/expo/**\n    why: live\n  - path: tooling/rust/**\n    why: stale — the parent never had this\n`,
		)
		const result = syncCheck({ childRoot: c, parentPath: p, log: () => {} })
		expect(result.failures.map(f => f.kind)).toContain('except-fossil')
		expect(result.failures.find(f => f.kind === 'except-fossil')?.path).toBe('tooling/rust/**')
	})
})
