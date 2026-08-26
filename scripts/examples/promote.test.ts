/**
 * promote.test.ts — the promotion mechanism against a FABRICATED minimal results layout in
 * a temp dir (mold: run.test.ts fixtures). The real scoreboard may legitimately hold zero
 * candidates at the current docTreeHash, so the mechanism is proven on a fixture repo:
 * base commit → uncommitted "eval build" → archivePatch (run.ts) → scoreboard row → promote.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { archivePatch } from '../skill-evals/run'
import type { ScoreRow, Task } from '../skill-evals/types'
import { extractPatchPaths, positiveGraderGlobs, promote, provenanceHeader, readQualifyingRows, rowScore, skillsFor } from './promote'

const HASH = 'hash-current'
const STAMP = 'agent-fix1'
const TASK_ID = 'demo-widget'

let root: string
let repo: string
let board: string
let candidates: string
let task: Task

function row(overrides: Partial<ScoreRow>): ScoreRow {
	return {
		ts: '2026-07-20T10:00:00.000Z',
		task: TASK_ID,
		mode: 'agent',
		pass: true,
		failedGraders: [],
		docTreeHash: HASH,
		model: 'sonnet',
		...overrides,
	}
}

beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), 'promote-fixture-'))
	repo = join(root, 'repo')
	board = join(root, 'scoreboard')
	candidates = join(root, 'candidates')
	mkdirSync(repo, { recursive: true })
	const git = (...args: string[]) =>
		execFileSync('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@test', ...args], {
			cwd: repo,
			stdio: 'ignore',
		})
	git('init', '-q')
	// A real skills dir so skillsFor() resolves against the declared source, not a list.
	mkdirSync(join(repo, '.claude', 'skills', 'entity'), { recursive: true })
	writeFileSync(join(repo, '.claude', 'skills', 'entity', 'SKILL.md'), '# entity\n')
	writeFileSync(join(repo, 'base.txt'), 'base\n')
	git('add', '-A')
	git('commit', '-qm', 'base')

	// The "eval build": one grader-matched file + one out-of-rubric file, archived via the
	// SAME archivePatch the runner uses (HEAD stays at the base commit — the patch adds them).
	mkdirSync(join(repo, 'packages', 'demo', 'src'), { recursive: true })
	writeFileSync(join(repo, 'packages', 'demo', 'src', 'Widget.ts'), 'export class Widget {}\n')
	writeFileSync(join(repo, 'scratchpad.txt'), 'not part of the rubric\n')
	archivePatch(repo, STAMP, TASK_ID, board)

	// Scoreboard: the qualifying row + a FAIL row + a stale-hash row (both must be ignored).
	writeFileSync(
		join(board, `${STAMP}.jsonl`),
		`${[
			JSON.stringify(row({})),
			JSON.stringify(row({ ts: '2026-07-19T10:00:00.000Z', pass: false, failedGraders: ['entity#shape'] })),
			JSON.stringify(row({ ts: '2026-07-21T10:00:00.000Z', docTreeHash: 'hash-stale' })),
		].join('\n')}\n`,
	)
	// A PERFECT row whose task definition no longer exists → must surface as skipped.
	writeFileSync(join(board, 'agent-ghost.jsonl'), `${JSON.stringify(row({ task: 'ghost-task' }))}\n`)

	task = {
		id: TASK_ID,
		tier: 'train',
		title: 'Demo widget slice',
		sourceSpec: '.specs/demo.md',
		goldRef: 'HEAD',
		baseRef: '',
		prompt: 'Build the Widget class exactly as the entity skill demands.',
		axes: ['entity', 'NOT-A-SKILL'],
		graders: [
			{ kind: 'file-exists', spec: 'packages/demo/src/Widget.ts' },
			{ kind: 'grep-must', spec: 'packages/demo/src/**/*.ts::class Widget', id: 'entity#shape' },
			{ kind: 'grep-must-not', spec: '**/*.ts::forbidden', id: 'entity#anti' },
			{ kind: 'tsc', spec: 'backend' },
		],
	}
})

afterAll(() => {
	rmSync(root, { recursive: true, force: true })
})

const runPromote = (overrides: Parameters<typeof promote>[0] = {}) =>
	promote({
		repoRoot: repo,
		scoreboardDir: board,
		candidatesDir: candidates,
		tasks: [task],
		docTreeHash: HASH,
		log: () => {},
		...overrides,
	})

// ─── Pure helpers ───────────────────────────────────────────────────

describe('extractPatchPaths', () => {
	it('collects the b-side of every diff header, including binary diffs, deduped and sorted', () => {
		const patch = [
			'diff --git a/packages/demo/src/Widget.ts b/packages/demo/src/Widget.ts',
			'new file mode 100644',
			'--- /dev/null',
			'+++ b/packages/demo/src/Widget.ts',
			'+export class Widget {}',
			'diff --git a/assets/logo.png b/assets/logo.png',
			'GIT binary patch',
			'literal 5',
			'diff --git a/packages/demo/src/Widget.ts b/packages/demo/src/Widget.ts',
		].join('\n')
		expect(extractPatchPaths(patch)).toEqual(['assets/logo.png', 'packages/demo/src/Widget.ts'])
	})
})

describe('positiveGraderGlobs', () => {
	it('takes file-exists + grep-must globs and ignores grep-must-not / non-glob graders', () => {
		expect(positiveGraderGlobs(task)).toEqual(['packages/demo/src/**/*.ts', 'packages/demo/src/Widget.ts'])
	})
})

describe('skillsFor', () => {
	it('keeps only grader-id prefixes / axes that name a real .claude/skills dir', () => {
		expect(skillsFor(task, repo)).toEqual(['entity'])
	})
})

describe('provenanceHeader', () => {
	it('wraps in the extension comment syntax and returns null when the format has none', () => {
		expect(provenanceHeader('a/b.ts', ['one', 'two'])).toBe('// one\n// two\n')
		expect(provenanceHeader('a/b.sql', ['one'])).toBe('-- one\n')
		expect(provenanceHeader('a/b.json', ['one'])).toBeNull()
	})
})

// ─── Scoreboard scan ────────────────────────────────────────────────

describe('readQualifyingRows', () => {
	const graderCounts = new Map([
		[TASK_ID, 4],
		['ghost-task', 4],
	])

	it('keeps agent rows scoring >= minScore; per task the best row wins (score, then current-docs, then newest)', () => {
		const qualifying = readQualifyingRows(board, { minScore: 90, docTreeHash: HASH, currentDocsOnly: false, graderCounts })
		expect([...qualifying.keys()].sort()).toEqual([TASK_ID, 'ghost-task'])
		const hit = qualifying.get(TASK_ID)
		expect(hit?.stamp).toBe(STAMP)
		expect(hit?.score).toBe(100)
		// Two 100% rows exist for TASK_ID: a NEWER one at a stale hash and this one at the current
		// hash — current-docs preference breaks the score tie. The 75% FAIL row is below the bar.
		expect(hit?.row.ts).toBe('2026-07-20T10:00:00.000Z')
	})

	it('minScore is the USER DECISION dial: a below-100 build qualifies once the bar admits it', () => {
		const partialBoard = join(root, 'scoreboard-partial')
		mkdirSync(partialBoard, { recursive: true })
		writeFileSync(
			join(partialBoard, 'agent-partial.jsonl'),
			`${JSON.stringify(row({ task: 'partial-task', pass: false, failedGraders: ['entity#shape'] }))}\n`,
		)
		const counts = new Map([['partial-task', 4]])
		const strict = readQualifyingRows(partialBoard, { minScore: 90, docTreeHash: HASH, currentDocsOnly: false, graderCounts: counts })
		expect(strict.size).toBe(0) // 75% < 90
		const relaxed = readQualifyingRows(partialBoard, { minScore: 70, docTreeHash: HASH, currentDocsOnly: false, graderCounts: counts })
		expect(relaxed.get('partial-task')?.score).toBe(75)
	})

	it('currentDocsOnly restores the strict old behavior (rows at other hashes never qualify)', () => {
		const qualifying = readQualifyingRows(board, { minScore: 90, docTreeHash: 'hash-nobody-has', currentDocsOnly: true, graderCounts })
		expect(qualifying.size).toBe(0)
	})

	it('rowScore: pass = 100; otherwise green/total; unknown grader count only qualifies a full pass', () => {
		expect(rowScore(row({}), 4)).toBe(100)
		expect(rowScore(row({ pass: false, failedGraders: ['a'] }), 4)).toBe(75)
		expect(rowScore(row({ pass: false, failedGraders: ['a'] }), undefined)).toBe(0)
		expect(rowScore(row({ pass: true, failedGraders: [] }), undefined)).toBe(100)
	})
})

// ─── The mechanism ──────────────────────────────────────────────────

describe('promote', () => {
	it('writes a candidate with WANT.md (prompt verbatim + provenance), headered GOT files, and NOTES.md', () => {
		const result = runPromote()
		const written = result.candidates.find(c => c.taskId === TASK_ID)
		expect(written?.status).toBe('written')
		// Grader-glob discipline: scratchpad.txt is in the patch but NOT in the rubric.
		expect(written?.files).toEqual(['packages/demo/src/Widget.ts'])

		const want = readFileSync(join(candidates, TASK_ID, 'WANT.md'), 'utf8')
		expect(want).toContain('Build the Widget class exactly as the entity skill demands.')
		expect(want).toContain(`\`${STAMP}\``)
		expect(want).toContain(`\`${HASH}\``)
		expect(want).toContain('`sonnet`')
		expect(want).toContain('2026-07-20T10:00:00.000Z')

		const got = readFileSync(join(candidates, TASK_ID, 'GOT', 'packages/demo/src/Widget.ts'), 'utf8')
		expect(got.startsWith('// CONTEXT-ORIGIN')).toBe(true)
		expect(got).toContain(`// stamp:       ${STAMP}`)
		expect(got).toContain('export class Widget {}')

		const notes = readFileSync(join(candidates, TASK_ID, 'NOTES.md'), 'utf8')
		expect(notes).toContain('`entity` → `.claude/skills/entity/`')
		expect(notes).toContain('packages/demo/src/Widget.ts')

		// The vanished-task row surfaces honestly instead of crashing the queue.
		const ghost = result.candidates.find(c => c.taskId === 'ghost-task')
		expect(ghost?.status).toBe('skipped')
		expect(ghost?.reason).toContain('no longer exists')
	})

	it('is idempotent — a re-run REPLACES the candidate dir instead of accreting into it', () => {
		const stale = join(candidates, TASK_ID, 'GOT', 'stale-leftover.ts')
		writeFileSync(stale, '// planted by the test\n')
		runPromote()
		expect(existsSync(stale)).toBe(false)
		expect(existsSync(join(candidates, TASK_ID, 'WANT.md'))).toBe(true)
	})

	it('--dry-run lists the queue without writing anything', () => {
		const dryDir = join(root, 'candidates-dry')
		const result = runPromote({ candidatesDir: dryDir, dryRun: true })
		const queued = result.candidates.find(c => c.taskId === TASK_ID)
		expect(queued?.status).toBe('queued')
		expect(queued?.files).toEqual(['packages/demo/src/Widget.ts'])
		expect(existsSync(dryDir)).toBe(false)
	})

	it('zero qualifying tasks is a valid state — empty queue, no writes, no throw', () => {
		const lines: string[] = []
		const result = runPromote({ docTreeHash: 'hash-nobody-has', currentDocsOnly: true, log: l => lines.push(l) })
		expect(result.candidates).toEqual([])
		expect(lines.join('\n')).toContain('nothing to queue')
	})

	it('scratch trees are cleaned up even on the happy path (finally discipline)', () => {
		const scratchDirs = () => new Set(readdirSync(tmpdir()).filter(d => d.startsWith('examples-promote-')))
		const before = scratchDirs()
		runPromote()
		// No NEW examples-promote-* mkdtemp dir may survive the run.
		const leaked = [...scratchDirs()].filter(d => !before.has(d))
		expect(leaked).toEqual([])
	})
})
