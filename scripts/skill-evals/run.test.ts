/**
 * run.test.ts — grader parsing units + a FAST grep integration against the MAIN repo
 * tree itself (no worktree creation — gold-mode smoke lives in the next workflow phase).
 */

import { describe, expect, it } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MAIN_REPO, globFiles, graderLabel, parseGrepSpec, parseVerdict, runGrader } from './graders'
import { SCOREBOARD_DIR, archivePatch, builderModelArg, builderName, patchPath } from './run'
import type { GraderSpec, Task } from './types'

const task: Task = {
	id: 'fixture-task',
	tier: 'train',
	title: 'fixture',
	sourceSpec: '.specs/none.md',
	goldRef: 'HEAD',
	baseRef: 'HEAD',
	prompt: 'n/a',
	axes: [],
	graders: [],
}

// ─── parseGrepSpec ──────────────────────────────────────────────────

describe('parseGrepSpec', () => {
	it('splits glob and regex on the first ::', () => {
		const { glob, regex } = parseGrepSpec('packages/api/**/*.ts::class \\w+ extends Entity')
		expect(glob).toBe('packages/api/**/*.ts')
		expect(regex.source).toBe('class \\w+ extends Entity')
	})

	it('keeps :: inside the regex part (only the FIRST :: splits)', () => {
		const { glob, regex } = parseGrepSpec('src/**/*.ts::Foo::Bar')
		expect(glob).toBe('src/**/*.ts')
		expect(regex.source).toBe('Foo::Bar')
	})

	it('compiles the regex with the m flag (line-anchored like grep)', () => {
		const { regex } = parseGrepSpec('a.ts::^import')
		expect(regex.flags).toContain('m')
		expect(regex.test('const x = 1\nimport y from "z"')).toBe(true)
	})

	it('rejects specs without a :: separator or with an empty glob', () => {
		expect(() => parseGrepSpec('no-separator-here')).toThrow('<glob>::<regex>')
		expect(() => parseGrepSpec('::^import')).toThrow('<glob>::<regex>')
	})
})

// ─── graderLabel ────────────────────────────────────────────────────

describe('graderLabel', () => {
	it('prefers the explicit id', () => {
		expect(graderLabel({ kind: 'tsc', spec: 'backend', id: 'backend-compiles' })).toBe('backend-compiles')
	})

	it('falls back to kind:spec', () => {
		expect(graderLabel({ kind: 'grep-must', spec: 'a/**::b' })).toBe('grep-must:a/**::b')
	})
})

// ─── globFiles (against the main repo — fast, narrow globs only) ────

describe('globFiles', () => {
	it('matches this harness own files', async () => {
		const files = await globFiles(MAIN_REPO, 'scripts/skill-evals/*.ts')
		expect(files).toContain('scripts/skill-evals/graders.ts')
		expect(files).toContain('scripts/skill-evals/run.ts')
		expect(files).toContain('scripts/skill-evals/types.ts')
	})

	it('returns [] for a glob with no matches', async () => {
		const files = await globFiles(MAIN_REPO, 'scripts/skill-evals/does-not-exist-*.zzz')
		expect(files).toEqual([])
	})
})

// ─── FAST integration: grep graders over the MAIN repo tree ─────────

describe('runGrader grep integration (treeRoot = main repo, no worktree)', () => {
	it('grep-must passes when the pattern exists', async () => {
		const grader: GraderSpec = { kind: 'grep-must', spec: 'scripts/skill-evals/types.ts::interface ScoreRow' }
		const result = await runGrader(task, grader, MAIN_REPO)
		expect(result.pass).toBe(true)
		expect(result.task).toBe('fixture-task')
		expect(result.detail).toContain('types.ts')
	})

	it('grep-must fails when the pattern is absent', async () => {
		const grader: GraderSpec = { kind: 'grep-must', spec: 'scripts/skill-evals/types.ts::interface DefinitelyNotAThing' }
		const result = await runGrader(task, grader, MAIN_REPO)
		expect(result.pass).toBe(false)
	})

	it('grep-must-not inverts: fails on present, passes on absent', async () => {
		const present = await runGrader(task, { kind: 'grep-must-not', spec: 'scripts/skill-evals/types.ts::interface ScoreRow' }, MAIN_REPO)
		expect(present.pass).toBe(false)
		const absent = await runGrader(
			task,
			{ kind: 'grep-must-not', spec: 'scripts/skill-evals/types.ts::interface DefinitelyNotAThing' },
			MAIN_REPO,
		)
		expect(absent.pass).toBe(true)
	})

	it('file-exists passes on a real glob and fails on a miss', async () => {
		const hit = await runGrader(task, { kind: 'file-exists', spec: 'scripts/skill-evals/README.md' }, MAIN_REPO)
		expect(hit.pass).toBe(true)
		const miss = await runGrader(task, { kind: 'file-exists', spec: 'scripts/skill-evals/missing-*.zzz' }, MAIN_REPO)
		expect(miss.pass).toBe(false)
	})

	it('reports a malformed spec as a failing grade, not a crash', async () => {
		const result = await runGrader(task, { kind: 'grep-must', spec: 'malformed-no-separator' }, MAIN_REPO)
		expect(result.pass).toBe(false)
		expect(result.detail).toContain('grader error')
	})

	it('rejects unknown tsc and detect specs as failing grades', async () => {
		const badTsc = await runGrader(task, { kind: 'tsc', spec: 'nope' }, MAIN_REPO)
		expect(badTsc.pass).toBe(false)
		expect(badTsc.detail).toContain('grader error')
		const badDetect = await runGrader(task, { kind: 'detect', spec: 'nope' }, MAIN_REPO)
		expect(badDetect.pass).toBe(false)
		expect(badDetect.detail).toContain('grader error')
	})
})

// ─── patchPath / archivePatch (one .patch per (stamp, task)) ────────

describe('patchPath', () => {
	it('is a pure function of (stamp, task id) — deterministic, 1:1, under the scoreboard dir', () => {
		// Deterministic: same pair, same path.
		expect(patchPath('agent-abc123', 'task-x')).toBe(patchPath('agent-abc123', 'task-x'))
		// Default dir is the real scoreboard, stem convention matches the .jsonl stem.
		expect(patchPath('agent-abc123', 'task-x')).toBe(join(SCOREBOARD_DIR, 'agent-abc123--task-x.patch'))
		// 1:1 — distinct tasks and distinct stamps never collide.
		expect(patchPath('agent-abc123', 'task-x')).not.toBe(patchPath('agent-abc123', 'task-y'))
		expect(patchPath('agent-abc123', 'task-x')).not.toBe(patchPath('agent-def456', 'task-x'))
		// Injectable dir (tests / consumers with fixture scoreboards).
		expect(patchPath('s', 't', '/tmp/board')).toBe('/tmp/board/s--t.patch')
	})
})

describe('archivePatch', () => {
	it('writes ONE patch per (stamp, task) and a re-run of the same pair REPLACES it — never concatenates', () => {
		const root = mkdtempSync(join(tmpdir(), 'archive-patch-fixture-'))
		try {
			const repo = join(root, 'repo')
			const board = join(root, 'scoreboard')
			mkdirSync(repo, { recursive: true })
			const git = (...args: string[]) =>
				execFileSync('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@test', ...args], { cwd: repo })
			git('init', '-q')
			writeFileSync(join(repo, 'base.txt'), 'base\n')
			git('add', '-A')
			git('commit', '-qm', 'base')

			// First run: one uncommitted file → one patch, exactly one diff inside.
			writeFileSync(join(repo, 'feature.txt'), 'build v1\n')
			const first = archivePatch(repo, 'stamp-a', 'task-x', board)
			expect(first.path).toBe(patchPath('stamp-a', 'task-x', board))
			const firstContent = readFileSync(first.path, 'utf8')
			expect(firstContent.match(/^diff --git/gm)?.length).toBe(1)
			expect(firstContent).toContain('+build v1')

			// Re-run of the SAME (stamp, task) with a changed build: the file is REPLACED —
			// still one diff, only the new content, and still exactly one .patch on disk.
			writeFileSync(join(repo, 'feature.txt'), 'build v2\n')
			const second = archivePatch(repo, 'stamp-a', 'task-x', board)
			expect(second.path).toBe(first.path)
			const secondContent = readFileSync(second.path, 'utf8')
			expect(secondContent.match(/^diff --git/gm)?.length).toBe(1)
			expect(secondContent).toContain('+build v2')
			expect(secondContent).not.toContain('+build v1')
			expect(readdirSync(board).filter(f => f.endsWith('.patch'))).toEqual(['stamp-a--task-x.patch'])

			// A different task under the same stamp gets its OWN file — 1:1, no sharing.
			writeFileSync(join(repo, 'other.txt'), 'other\n')
			const other = archivePatch(repo, 'stamp-a', 'task-y', board)
			expect(other.path).not.toBe(first.path)
			expect(
				readdirSync(board)
					.filter(f => f.endsWith('.patch'))
					.sort(),
			).toEqual(['stamp-a--task-x.patch', 'stamp-a--task-y.patch'])
		} finally {
			rmSync(root, { recursive: true, force: true })
		}
	})

	it('the archived patch stays git apply-able against the base tree (the promotion contract)', () => {
		const root = mkdtempSync(join(tmpdir(), 'archive-patch-apply-'))
		try {
			const repo = join(root, 'repo')
			const board = join(root, 'scoreboard')
			mkdirSync(repo, { recursive: true })
			const git = (...args: string[]) =>
				execFileSync('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@test', ...args], { cwd: repo })
			git('init', '-q')
			writeFileSync(join(repo, 'base.txt'), 'base\n')
			git('add', '-A')
			git('commit', '-qm', 'base')

			writeFileSync(join(repo, 'src.ts'), 'export const built = 1\n')
			archivePatch(repo, 'stamp-b', 'task-z', board)
			// Second archive of the same pair — with the OLD append behavior this would double
			// the hunks and make `git apply` fail; with replace it must keep applying cleanly.
			archivePatch(repo, 'stamp-b', 'task-z', board)

			const scratch = join(root, 'scratch')
			execFileSync('git', ['worktree', 'add', '--detach', scratch, 'HEAD'], { cwd: repo })
			try {
				execFileSync('git', ['apply', '--binary', '--whitespace=nowarn', patchPath('stamp-b', 'task-z', board)], {
					cwd: scratch,
				})
				expect(readFileSync(join(scratch, 'src.ts'), 'utf8')).toBe('export const built = 1\n')
			} finally {
				execFileSync('git', ['worktree', 'remove', '--force', scratch], { cwd: repo })
			}
		} finally {
			rmSync(root, { recursive: true, force: true })
		}
	})
})

describe('parseVerdict (judge grader)', () => {
	it('extracts PASS / FAIL with reason, last verdict wins, null when absent', () => {
		expect(parseVerdict('…analysis…\nVERDICT: PASS\n')).toEqual({ pass: true, reason: undefined })
		expect(parseVerdict('VERDICT: FAIL — read lives in sales, not ui')).toEqual({
			pass: false,
			reason: 'read lives in sales, not ui',
		})
		// rubric restated first ("must end with VERDICT: PASS"), real verdict later → last wins
		expect(parseVerdict("the rubric says end with 'VERDICT: PASS or FAIL'.\nVERDICT: FAIL - missing barrel export")?.pass).toBe(false)
		expect(parseVerdict('no verdict here')).toBeNull()
	})
})

describe('builder model contract (task.builder → --model; AGENT_MODEL overrides)', () => {
	const task = (builder?: 'sonnet' | 'opus' | 'fable') => ({ builder }) as import('./types').Task

	it('declared builder resolves to the explicit model id and the provenance name', () => {
		expect(builderName(task('fable'))).toBe('fable')
		expect(builderModelArg(task('fable'))).toBe('claude-fable-5')
		expect(builderModelArg(task('sonnet'))).toBe('sonnet')
		expect(builderModelArg(task('opus'))).toBe('opus')
	})

	it('absent builder = CLI default (no --model arg, provenance "default")', () => {
		expect(builderName(task())).toBe('default')
		expect(builderModelArg(task())).toBeUndefined()
	})

	it('AGENT_MODEL env overrides any declaration (operator escape hatch)', () => {
		process.env.AGENT_MODEL = 'haiku'
		try {
			expect(builderName(task('fable'))).toBe('haiku')
			expect(builderModelArg(task('fable'))).toBe('haiku')
		} finally {
			delete process.env.AGENT_MODEL
		}
	})

	it('every task declares a KNOWN builder (the contract is closed)', () => {
		const { loadTasks } = require('./run') as typeof import('./run')
		for (const t of loadTasks()) {
			expect(['sonnet', 'opus', 'fable', undefined]).toContain(t.builder)
		}
	})
})
