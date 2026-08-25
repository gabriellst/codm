#!/usr/bin/env bun
/**
 * promote.ts — `bun examples:promote`: HIGH-SCORE eval builds → example-pair CANDIDATE QUEUE.
 *
 * NEVER auto-promotes (user decision, .plans/2026-07-21-declarative-repo.md F2): candidates
 * land under scripts/skill-evals/candidates/<task-id>/ and a human batch-approves them into
 * examples/pairs/. This script only builds and reports the queue.
 *
 * Pipeline per qualifying task:
 *   scoreboard/<stamp>.jsonl row (mode=agent ∧ score >= --min-score; best per task by
 *   score → current-docs → newest; docTreeHash recorded as provenance)
 *     → patchPath(stamp, task)            [layout owned by run.ts — imported, never re-derived]
 *     → git apply in a SCRATCH worktree at the task's baseRef (or HEAD) — never the main tree
 *     → extract the patch's files matched by the task's POSITIVE grader globs
 *       (grep-must + file-exists; grep-must-not asserts absence over broad trees, so its
 *        globs would drag unrelated files in — deliberately excluded)
 *     → scripts/skill-evals/candidates/<task-id>/{WANT.md, GOT/**, NOTES.md}
 *
 * Idempotent: re-running replaces a candidate from the same (stamp, task, docTreeHash).
 * --dry-run lists the queue without writing. Zero qualifying tasks is a valid state →
 * exit 0. Scratch trees are always removed (finally).
 *
 * Usage:
 *   bun examples:promote [--dry-run]
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import { MAIN_REPO, parseGrepSpec } from '../skill-evals/graders'
import { SCOREBOARD_DIR, computeDocTreeHash, loadTasks, patchPath } from '../skill-evals/run'
import type { ScoreRow, Task } from '../skill-evals/types'

// ─── Contracts ──────────────────────────────────────────────────────

export interface PromoteOptions {
	/** Git repo the scratch worktrees are created from (default: this repo). */
	repoRoot?: string
	/** Where the .jsonl scoreboards + .patch archives live (default: run.ts's SCOREBOARD_DIR). */
	scoreboardDir?: string
	/** Queue root (default: <repoRoot>/scripts/skill-evals/candidates). */
	candidatesDir?: string
	/** Task definitions (default: loadTasks() from tasks/*.yaml). */
	tasks?: Task[]
	/** Current doc-tree hash — provenance + tie-break preference (default: computeDocTreeHash(repoRoot)). */
	docTreeHash?: string
	/** Minimum grader score (percent, 0-100) a row needs to qualify. USER DECISION: candidates are
	 *  the HIGH-SCORE builds on the scoreboard, not only PERFECT ones. Default 90. */
	minScore?: number
	/** Restrict to rows graded at the CURRENT docTreeHash (old strict behavior). Default false. */
	currentDocsOnly?: boolean
	/** List the queue without writing anything. */
	dryRun?: boolean
	log?: (line: string) => void
}

export interface CandidateReport {
	taskId: string
	stamp: string
	/** Grading timestamp from the ScoreRow. */
	ts: string
	/** Grader score (percent) of the selected row — 100 = every grader green. */
	score: number
	model: string
	status: 'queued' | 'written' | 'skipped'
	reason?: string
	/** Repo-relative files extracted into GOT/ (or that WOULD be, in dry-run). */
	files: string[]
	/** Skill names derived from grader ids + axes that name a real .claude/skills/ dir. */
	skills: string[]
}

export interface PromoteResult {
	docTreeHash: string
	candidates: CandidateReport[]
}

// ─── Scoreboard scan ────────────────────────────────────────────────

/** A row's grader score in percent: pass = 100; otherwise green/total from the task's grader count. */
export function rowScore(row: ScoreRow, graderCount: number | undefined): number {
	if (row.pass) return 100
	if (!graderCount || graderCount <= 0) return 0 // unknown task shape — only a full pass can qualify
	const failed = row.failedGraders?.length ?? graderCount
	return Math.max(0, Math.round(((graderCount - failed) / graderCount) * 100))
}

export interface QualifyingRow {
	stamp: string
	row: ScoreRow
	score: number
}

/**
 * Best qualifying agent-mode row per task id (score >= minScore), keyed by task id, with the
 * stamp it was found under (= the .jsonl stem — the same stem patchPath uses).
 * Selection per task: highest score first, then rows at the CURRENT docTreeHash, then newest.
 * `currentDocsOnly` restores the strict old behavior (only rows at the current hash qualify).
 */
export function readQualifyingRows(
	scoreboardDir: string,
	opts: { minScore: number; docTreeHash: string; currentDocsOnly: boolean; graderCounts: Map<string, number> },
): Map<string, QualifyingRow> {
	const best = new Map<string, QualifyingRow>()
	if (!existsSync(scoreboardDir)) return best
	const better = (a: QualifyingRow, b: QualifyingRow): boolean => {
		if (a.score !== b.score) return a.score > b.score
		const aCur = a.row.docTreeHash === opts.docTreeHash
		const bCur = b.row.docTreeHash === opts.docTreeHash
		if (aCur !== bCur) return aCur
		return a.row.ts > b.row.ts
	}
	for (const entry of readdirSync(scoreboardDir).sort()) {
		if (!entry.endsWith('.jsonl')) continue
		const stamp = entry.slice(0, -'.jsonl'.length)
		for (const line of readFileSync(join(scoreboardDir, entry), 'utf8').split('\n')) {
			if (line.trim() === '') continue
			let row: ScoreRow
			try {
				row = JSON.parse(line) as ScoreRow
			} catch {
				continue // half-written line from a killed run — it simply doesn't qualify
			}
			if (row.mode !== 'agent') continue
			if (opts.currentDocsOnly && row.docTreeHash !== opts.docTreeHash) continue
			const score = rowScore(row, opts.graderCounts.get(row.task))
			if (score < opts.minScore) continue
			const cand = { stamp, row, score }
			const prev = best.get(row.task)
			if (!prev || better(cand, prev)) best.set(row.task, cand)
		}
	}
	return best
}

// ─── Patch → files ──────────────────────────────────────────────────

/**
 * b-side path of every `diff --git` header in a git patch — covers text AND binary diffs
 * (binary diffs carry no `+++` line). Greedy a-side so a path containing ` b/` still splits
 * on the LAST separator.
 */
export function extractPatchPaths(patch: string): string[] {
	const paths = new Set<string>()
	for (const line of patch.split('\n')) {
		const m = /^diff --git "?a\/.* "?b\/(.+?)"?$/.exec(line)
		if (m?.[1]) paths.add(m[1])
	}
	return [...paths].sort()
}

/** Globs a task's rubric REQUIRES files to satisfy: grep-must + file-exists specs. */
export function positiveGraderGlobs(task: Task): string[] {
	const globs = new Set<string>()
	for (const g of task.graders) {
		if (g.kind === 'file-exists') globs.add(g.spec)
		else if (g.kind === 'grep-must') globs.add(parseGrepSpec(g.spec).glob)
	}
	return [...globs].sort()
}

// ─── Skill mapping ──────────────────────────────────────────────────

/**
 * Skills the exemplar maps to: grader-id `<skill>#…` prefixes + task axes, kept only when
 * they name a real .claude/skills/<name>/ dir (derived from the declared source, not a
 * hand-maintained prefix list — author prefixes like `atlas#` fall out naturally).
 */
export function skillsFor(task: Task, repoRoot: string): string[] {
	const names = new Set<string>()
	for (const g of task.graders) {
		const hash = g.id?.indexOf('#') ?? -1
		if (g.id != null && hash > 0) names.add(g.id.slice(0, hash))
	}
	for (const axis of task.axes) names.add(axis)
	return [...names].filter(name => existsSync(join(repoRoot, '.claude', 'skills', name))).sort()
}

// ─── Provenance headers ─────────────────────────────────────────────

/**
 * Wrap provenance lines in the comment syntax of the file's extension. Returns null when
 * the format has no comment syntax (e.g. .json) — those files go in verbatim and their
 * provenance lives in WANT.md/NOTES.md only.
 */
export function provenanceHeader(relPath: string, lines: string[]): string | null {
	const ext = relPath.includes('.') ? relPath.slice(relPath.lastIndexOf('.') + 1).toLowerCase() : ''
	if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts', 'go'].includes(ext)) {
		return `${lines.map(l => `// ${l}`).join('\n')}\n`
	}
	if (['css', 'scss'].includes(ext)) return `/*\n${lines.map(l => ` * ${l}`).join('\n')}\n */\n`
	if (['md', 'mdx', 'html', 'astro', 'svg'].includes(ext)) return `<!--\n${lines.map(l => `  ${l}`).join('\n')}\n-->\n`
	if (['yaml', 'yml', 'sh', 'bash', 'toml', 'py', 'tf'].includes(ext)) return `${lines.map(l => `# ${l}`).join('\n')}\n`
	if (ext === 'sql') return `${lines.map(l => `-- ${l}`).join('\n')}\n`
	return null
}

function headerLines(task: Task, stamp: string, row: ScoreRow, relPath: string): string[] {
	return [
		`CONTEXT-ORIGIN · candidate corpus · scripts/skill-evals/candidates/${task.id}`,
		`task:        ${task.id}`,
		`stamp:       ${stamp}`,
		`docTreeHash: ${row.docTreeHash}`,
		`model:       ${row.model ?? 'default'}`,
		`graded:      ${row.ts}`,
		`source:      ${relPath} (archived eval build, applied at ${task.baseRef || 'HEAD'})`,
		'Verbatim extract of the archived eval build — NOT a live module. Do not import it.',
	]
}

// ─── Candidate documents ────────────────────────────────────────────

function wantMd(task: Task, stamp: string, row: ScoreRow, score: number, patchFile: string): string {
	return `# WANT — ${task.title}

> **CANDIDATE — not approved.** Generated by \`bun examples:promote\` into \`scripts/skill-evals/candidates/\`.
> Promotion into \`examples/pairs/\` is a USER batch decision — nothing is auto-promoted.

## Provenance

- **task:** \`${task.id}\` (tier: ${task.tier})
- **stamp:** \`${stamp}\`
- **docTreeHash:** \`${row.docTreeHash}\`
- **score:** ${score}% (${task.graders.length} graders)
- **model:** \`${row.model ?? 'default'}\`
- **graded:** ${row.ts}
- **sourceSpec:** \`${task.sourceSpec}\`
- **patch:** \`scripts/skill-evals/scoreboard/${basename(patchFile)}\`

---

## Task prompt (verbatim)

${task.prompt}
`
}

function notesMd(task: Task, stamp: string, row: ScoreRow, score: number, files: string[], skills: string[]): string {
	const skillLines =
		skills.length > 0
			? skills.map(s => `- \`${s}\` → \`.claude/skills/${s}/\``).join('\n')
			: '- (none derived from grader ids/axes — fill in by hand)'
	return `# NOTES — auto-draft (candidate \`${task.id}\`)

> Auto-generated by \`bun examples:promote\`. Review and REWRITE before approving into
> \`examples/pairs/\` — this draft records only what the machine knows.

## What the exemplar shows

${task.title}. An eval build that scored ${score}% (${task.graders.length} graders) at
docTreeHash \`${row.docTreeHash}\`, built by model \`${row.model ?? 'default'}\`, graded ${row.ts}
(stamp \`${stamp}\`). Axes exercised: ${task.axes.length > 0 ? task.axes.join(', ') : '(none declared)'}.

## Skill mapping (derived)

${skillLines}

## Files (GOT/)

${files.map(f => `- \`${f}\``).join('\n')}
`
}

// ─── Scratch worktree (never the main tree) ─────────────────────────

function withScratchTree<T>(repoRoot: string, ref: string, fn: (tree: string) => T): T {
	const parent = mkdtempSync(join(tmpdir(), 'examples-promote-'))
	const tree = join(parent, 'tree')
	execFileSync('git', ['worktree', 'add', '--detach', tree, ref], { cwd: repoRoot, stdio: 'ignore' })
	try {
		return fn(tree)
	} finally {
		try {
			execFileSync('git', ['worktree', 'remove', '--force', tree], { cwd: repoRoot, stdio: 'ignore' })
		} catch {
			// already gone or git refused — rmSync + prune below still clean up
		}
		rmSync(parent, { recursive: true, force: true })
		try {
			execFileSync('git', ['worktree', 'prune'], { cwd: repoRoot, stdio: 'ignore' })
		} catch {
			// best-effort
		}
	}
}

// ─── One candidate ──────────────────────────────────────────────────

interface CandidateContext {
	repoRoot: string
	scoreboardDir: string
	candidatesDir: string
	dryRun: boolean
}

function buildCandidate(ctx: CandidateContext, task: Task, stamp: string, row: ScoreRow, score: number): CandidateReport {
	const base = { taskId: task.id, stamp, ts: row.ts, score, model: row.model ?? 'default' }
	const skip = (reason: string, skills: string[] = []): CandidateReport => ({
		...base,
		status: 'skipped',
		reason,
		files: [],
		skills,
	})

	const patchFile = patchPath(stamp, task.id, ctx.scoreboardDir)
	if (!existsSync(patchFile)) return skip(`patch missing: ${basename(patchFile)}`)

	let globs: string[]
	try {
		globs = positiveGraderGlobs(task)
	} catch (err) {
		return skip(`malformed grader spec: ${err}`)
	}
	const matchers = globs.map(g => new Bun.Glob(g))
	const files = extractPatchPaths(readFileSync(patchFile, 'utf8')).filter(p => matchers.some(m => m.match(p)))
	if (files.length === 0) return skip('no patch file matches the task grader globs')

	const skills = skillsFor(task, ctx.repoRoot)
	if (ctx.dryRun) return { ...base, status: 'queued', files, skills }

	const ref = task.baseRef || 'HEAD'
	return withScratchTree(ctx.repoRoot, ref, tree => {
		try {
			execFileSync('git', ['apply', '--binary', '--whitespace=nowarn', patchFile], { cwd: tree, stdio: 'ignore' })
		} catch {
			return skip(`patch does not git-apply at ${ref} (concatenated legacy patch? re-run the eval to regenerate it)`, skills)
		}
		const present = files.filter(f => existsSync(join(tree, f))) // deletions drop out
		if (present.length === 0) return skip('grader-matched paths absent after apply', skills)

		// Idempotent: a re-run of the same (stamp, task, docTreeHash) REPLACES the candidate.
		const candDir = join(ctx.candidatesDir, task.id)
		rmSync(candDir, { recursive: true, force: true })
		mkdirSync(join(candDir, 'GOT'), { recursive: true })
		writeFileSync(join(candDir, 'WANT.md'), wantMd(task, stamp, row, score, patchFile))
		for (const rel of present) {
			const dest = join(candDir, 'GOT', rel)
			mkdirSync(dirname(dest), { recursive: true })
			const body = readFileSync(join(tree, rel), 'utf8')
			const header = provenanceHeader(rel, headerLines(task, stamp, row, rel))
			writeFileSync(dest, header ? `${header}${body}` : body)
		}
		writeFileSync(join(candDir, 'NOTES.md'), notesMd(task, stamp, row, score, present, skills))
		return { ...base, status: 'written', files: present, skills }
	})
}

// ─── Queue ──────────────────────────────────────────────────────────

function printSummary(candidates: CandidateReport[], docTreeHash: string, dryRun: boolean, log: (l: string) => void): void {
	const idW = Math.max(4, ...candidates.map(c => c.taskId.length))
	const stampW = Math.max(5, ...candidates.map(c => c.stamp.length))
	const modelW = Math.max(5, ...candidates.map(c => c.model.length))
	log(`\ncandidate queue @ docTreeHash ${docTreeHash}${dryRun ? ' (dry-run — nothing written)' : ''}`)
	log(`${'task'.padEnd(idW)}  ${'stamp'.padEnd(stampW)}  ${'model'.padEnd(modelW)}  files  status`)
	log(`${'─'.repeat(idW)}  ${'─'.repeat(stampW)}  ${'─'.repeat(modelW)}  ─────  ${'─'.repeat(30)}`)
	for (const c of candidates) {
		const status = c.status === 'skipped' ? `skipped — ${c.reason}` : c.status
		log(`${c.taskId.padEnd(idW)}  ${c.stamp.padEnd(stampW)}  ${c.model.padEnd(modelW)}  ${String(c.files.length).padStart(5)}  ${status}`)
	}
	const written = candidates.filter(c => c.status === 'written').length
	const queued = candidates.filter(c => c.status === 'queued').length
	const skipped = candidates.filter(c => c.status === 'skipped').length
	log(`\n${written} written · ${queued} queued (dry-run) · ${skipped} skipped — approval into examples/pairs/ is a USER batch decision`)
}

export function promote(opts: PromoteOptions = {}): PromoteResult {
	const repoRoot = opts.repoRoot ?? MAIN_REPO
	const scoreboardDir = opts.scoreboardDir ?? SCOREBOARD_DIR
	const candidatesDir = opts.candidatesDir ?? join(repoRoot, 'scripts', 'skill-evals', 'candidates')
	const tasks = opts.tasks ?? loadTasks()
	const docTreeHash = opts.docTreeHash ?? computeDocTreeHash(repoRoot)
	const minScore = opts.minScore ?? 90
	const currentDocsOnly = opts.currentDocsOnly === true
	const dryRun = opts.dryRun === true
	const log = opts.log ?? console.log

	const graderCounts = new Map(tasks.map(t => [t.id, t.graders.length] as const))
	const qualifying = readQualifyingRows(scoreboardDir, { minScore, docTreeHash, currentDocsOnly, graderCounts })
	if (qualifying.size === 0) {
		log(
			`no agent-mode tasks scoring >= ${minScore}% on the scoreboard${currentDocsOnly ? ` at the current docTreeHash (${docTreeHash})` : ''} — nothing to queue.`,
		)
		log('valid state: run `bun scripts/skill-evals/run.ts --agent <task…>` and re-promote once a task scores high enough.')
		return { docTreeHash, candidates: [] }
	}

	const byId = new Map(tasks.map(t => [t.id, t] as const))
	const candidates: CandidateReport[] = []
	for (const [taskId, { stamp, row, score }] of [...qualifying.entries()].sort(([a], [b]) => a.localeCompare(b))) {
		const task = byId.get(taskId)
		if (!task) {
			candidates.push({
				taskId,
				stamp,
				ts: row.ts,
				score,
				model: row.model ?? 'default',
				status: 'skipped',
				reason: 'task no longer exists in tasks/*.yaml',
				files: [],
				skills: [],
			})
			continue
		}
		candidates.push(buildCandidate({ repoRoot, scoreboardDir, candidatesDir, dryRun }, task, stamp, row, score))
	}
	printSummary(candidates, docTreeHash, dryRun, log)
	return { docTreeHash, candidates }
}

// ─── CLI ────────────────────────────────────────────────────────────

const HELP = `examples:promote — queue HIGH-SCORE eval builds as example-pair candidates.

Scans scripts/skill-evals/scoreboard/*.jsonl for agent-mode rows scoring >= --min-score
(default 90%), git-applies each task's archived .patch in a scratch worktree, extracts the
files its graders require, and writes scripts/skill-evals/candidates/<task-id>/ (WANT.md + GOT/ +
NOTES.md). Per task the BEST row wins (score, then current-docs rows, then newest); the
docTreeHash is recorded as provenance. NEVER auto-promotes — a human batch-approves
candidates into examples/pairs/.

Usage:
  bun examples:promote                     build/replace the candidate queue
  bun examples:promote --min-score=95      raise the qualifying bar
  bun examples:promote --current-docs-only only rows graded at the current doc tree
  bun examples:promote --dry-run           list what would be queued, write nothing
  bun examples:promote --help              this text`

function main(): number {
	const { values } = parseArgs({
		args: process.argv.slice(2),
		options: {
			'dry-run': { type: 'boolean', default: false },
			'min-score': { type: 'string' },
			'current-docs-only': { type: 'boolean', default: false },
			help: { type: 'boolean', default: false },
		},
	})
	if (values.help) {
		console.log(HELP)
		return 0
	}
	const minScore = values['min-score'] === undefined ? undefined : Number(values['min-score'])
	if (minScore !== undefined && (Number.isNaN(minScore) || minScore < 0 || minScore > 100)) {
		console.error('--min-score must be a number between 0 and 100')
		return 1
	}
	promote({ dryRun: values['dry-run'] === true, minScore, currentDocsOnly: values['current-docs-only'] === true })
	return 0
}

if (import.meta.main) process.exit(main())
