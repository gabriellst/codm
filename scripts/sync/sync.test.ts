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

	it('rejects unknown top-level keys — absence IS the owned declaration', () => {
		expect(() => parseManifest(`parent:\n  repo: x\n  ref: ${sha1}\nowned:\n  - src/**\n`)).toThrow(/unknown top-level key 'owned'/)
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
