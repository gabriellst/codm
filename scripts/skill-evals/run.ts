#!/usr/bin/env bun
/**
 * run.ts — skill-evals runner (rung 4 of the correctness system).
 *
 * Usage:
 *   bun scripts/skill-evals/run.ts --gold task-a task-b      # grade gold refs of specific tasks
 *   bun scripts/skill-evals/run.ts --gold --all-train        # grade gold refs of every train-tier task
 *   bun scripts/skill-evals/run.ts --agent task-a            # EXPERIMENTAL — see --help
 *   bun scripts/skill-evals/run.ts --help
 *
 * Options:
 *   --gold          Grade each task's goldRef tree. Gold MUST score 100% — a failing
 *                   grader on gold is a grader bug, so the run exits 1 on any failure.
 *   --agent         EXPERIMENTAL: worktree at baseRef + `claude -p <prompt>` + grade.
 *                   Scaffolding only — not exercised by CI yet; expect rough edges
 *                   (no transcript capture, no retry, serial execution).
 *   --all-train     Select every task with tier: train (gold mode).
 *   --stamp S       Scoreboard file stem (default: <mode>-<HEAD short sha>[-n]).
 *
 * Each run appends one ScoreRow per task to scripts/skill-evals/scoreboard/<stamp>.jsonl.
 * Agent builds are additionally archived as ONE .patch per (stamp, task) — path owned by
 * the exported patchPath(); a re-run of the same pair REPLACES the file (never appends).
 * Eval worktrees are throwaway: created detached under $TMPDIR, force-removed in a finally
 * (never under .claude/worktrees/ — that dir is for feature work). A $TMPDIR tree is
 * OUTSIDE the main checkout, so node_modules does NOT fall through — after checkout the
 * runner mirrors the main repo's installed node_modules into the tree as per-entry
 * symlinks (workspace packages re-pointed at the graded tree's own copies), so tsc/test
 * graders work without an install. See mirrorNodeModules().
 */

import { execFileSync, execSync } from 'node:child_process'
import {
	appendFileSync,
	copyFileSync,
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	readlinkSync,
	rmSync,
	statSync,
	symlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import { parse as parseYaml } from 'yaml'
import { MAIN_REPO, graderLabel, runGrader } from './graders'
import type { GradeResult, RunMode, ScoreRow, Task } from './types'

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname)
const TASKS_DIR = join(SCRIPT_DIR, 'tasks')
export const SCOREBOARD_DIR = join(SCRIPT_DIR, 'scoreboard')

// ─── Git helpers ────────────────────────────────────────────────────

function git(args: string, cwd = MAIN_REPO): string {
	return execSync(`git ${args}`, { cwd, encoding: 'utf8' }).trim()
}

// ─── Task loading ───────────────────────────────────────────────────

function asTasks(parsed: unknown, file: string): Task[] {
	const raw = Array.isArray(parsed)
		? parsed
		: parsed != null && typeof parsed === 'object' && 'tasks' in parsed
			? ((parsed as { tasks: unknown[] }).tasks ?? [])
			: [parsed]
	return raw.map(t => {
		const task = t as Task
		for (const field of ['id', 'tier', 'title', 'goldRef', 'baseRef', 'graders'] as const) {
			if (task?.[field] == null) throw new Error(`${file}: task missing required field '${field}'`)
		}
		return task
	})
}

export function loadTasks(dir = TASKS_DIR): Task[] {
	if (!existsSync(dir)) return []
	const tasks: Task[] = []
	for (const entry of readdirSync(dir).sort()) {
		if (!/\.ya?ml$/.test(entry)) continue
		tasks.push(...asTasks(parseYaml(readFileSync(join(dir, entry), 'utf8')), entry))
	}
	const seen = new Set<string>()
	for (const t of tasks) {
		if (seen.has(t.id)) throw new Error(`duplicate task id: ${t.id}`)
		seen.add(t.id)
	}
	return tasks
}

// ─── Doc-tree hash (main repo working-tree contents, not HEAD) ──────

const DOC_PATHS = ['.claude/skills', '.claude/registry.yaml', 'docs']

export function computeDocTreeHash(root = MAIN_REPO): string {
	const files = git(`ls-files -- ${DOC_PATHS.join(' ')}`, root)
		.split('\n')
		.filter(Boolean)
		.sort()
	const hasher = new Bun.CryptoHasher('sha256')
	for (const file of files) {
		const abs = resolve(root, file)
		if (!existsSync(abs)) continue // tracked but deleted in working tree
		hasher.update(file)
		hasher.update('\0')
		hasher.update(readFileSync(abs))
		hasher.update('\0')
	}
	return hasher.digest('hex').slice(0, 12)
}

// ─── node_modules overlay ───────────────────────────────────────────
//
// A $TMPDIR worktree is outside the main checkout, so Node/Bun module resolution
// (which only walks ancestor dirs) finds no node_modules at all — `bun x tsc` would
// auto-install a bare typescript and every package import would fail to resolve.
// Fix: mirror each installed node_modules dir of the main repo into the tree as
// per-entry symlinks. Workspace-package links (node_modules/@codedm/* → packages/*)
// are re-pointed at the GRADED TREE's own copy when present, so cross-package types
// (committed SDK + contracts bindings) come from the ref under grade, never from the
// main checkout's current HEAD.

function isDirent(path: string): boolean {
	try {
		return lstatSync(path).isDirectory()
	} catch {
		return false
	}
}

/** Installed node_modules dirs in the main checkout: root + per-package (2 levels under packages/). */
function findMainNodeModulesDirs(): string[] {
	const dirs: string[] = []
	if (existsSync(join(MAIN_REPO, 'node_modules'))) dirs.push(join(MAIN_REPO, 'node_modules'))
	const packagesRoot = join(MAIN_REPO, 'packages')
	if (!existsSync(packagesRoot)) return dirs
	for (const a of readdirSync(packagesRoot)) {
		const aPath = join(packagesRoot, a)
		if (!isDirent(aPath)) continue
		if (existsSync(join(aPath, 'node_modules'))) dirs.push(join(aPath, 'node_modules'))
		for (const b of readdirSync(aPath)) {
			if (b === 'node_modules') continue
			const bPath = join(aPath, b)
			if (isDirent(bPath) && existsSync(join(bPath, 'node_modules'))) dirs.push(join(bPath, 'node_modules'))
		}
	}
	return dirs
}

/** Symlink one node_modules entry; workspace-package links retarget into the graded tree. */
function linkEntry(mainEntry: string, treeEntry: string, treeRoot: string): void {
	if (lstatSync(mainEntry).isSymbolicLink()) {
		const target = resolve(dirname(mainEntry), readlinkSync(mainEntry))
		const isWorkspaceLink = target.startsWith(`${MAIN_REPO}${sep}`) && !target.includes(`${sep}node_modules${sep}`)
		if (isWorkspaceLink) {
			const inTree = join(treeRoot, relative(MAIN_REPO, target))
			symlinkSync(existsSync(inTree) ? inTree : target, treeEntry)
			return
		}
	}
	symlinkSync(mainEntry, treeEntry)
}

function mirrorNodeModules(treeRoot: string): void {
	for (const mainNm of findMainNodeModulesDirs()) {
		const treeNm = join(treeRoot, relative(MAIN_REPO, mainNm))
		if (!existsSync(dirname(treeNm)) || existsSync(treeNm)) continue // package absent at this ref
		mkdirSync(treeNm, { recursive: true })
		for (const entry of readdirSync(mainNm)) {
			const mainEntry = join(mainNm, entry)
			if (entry.startsWith('@') && isDirent(mainEntry) && !lstatSync(mainEntry).isSymbolicLink()) {
				// Scope dir: keep it a real dir so individual workspace packages can retarget.
				mkdirSync(join(treeNm, entry))
				for (const sub of readdirSync(mainEntry)) {
					linkEntry(join(mainEntry, sub), join(treeNm, entry, sub), treeRoot)
				}
			} else {
				linkEntry(mainEntry, join(treeNm, entry), treeRoot)
			}
		}
	}
}

// ─── Throwaway worktrees (under $TMPDIR, never .claude/worktrees) ───

async function withWorktree<T>(ref: string, fn: (treeRoot: string) => Promise<T>): Promise<T> {
	const parent = mkdtempSync(join(tmpdir(), 'skill-eval-'))
	const tree = join(parent, 'tree')
	git(`worktree add --detach ${tree} ${ref}`)
	mirrorNodeModules(tree)
	try {
		return await fn(tree)
	} finally {
		try {
			git(`worktree remove --force ${tree}`)
		} catch {
			// Already gone or git refused — the prune below + rmSync still clean up.
		}
		rmSync(parent, { recursive: true, force: true })
		try {
			git('worktree prune')
		} catch {
			// Best-effort.
		}
	}
}

// ─── Inject (feature-loop verifier artifacts → tree, pre-agent) ─────

function injectFiles(task: Task, treeRoot: string): void {
	for (const { from, to } of task.inject ?? []) {
		const src = resolve(MAIN_REPO, from)
		const dest = resolve(treeRoot, to)
		if (!existsSync(src)) throw new Error(`inject source missing: ${from}`)
		mkdirSync(dirname(dest), { recursive: true })
		copyFileSync(src, dest)
		console.log(`    injected ${from} → ${to}`)
	}
}

// ─── Grading one task tree ──────────────────────────────────────────

async function gradeTree(task: Task, treeRoot: string): Promise<GradeResult[]> {
	const results: GradeResult[] = []
	for (const grader of task.graders) {
		const result = await runGrader(task, grader, treeRoot)
		const icon = result.pass ? 'ok  ' : 'FAIL'
		console.log(`    [${icon}] ${result.grader}`)
		if (!result.pass) console.log(`           ${result.detail.split('\n').join('\n           ')}`)
		results.push(result)
	}
	return results
}

function toScoreRow(task: Task, mode: RunMode, results: GradeResult[], docTreeHash: string): ScoreRow {
	const failed = results.filter(r => !r.pass)
	return {
		ts: new Date().toISOString(),
		task: task.id,
		mode,
		pass: failed.length === 0,
		failedGraders: failed.map(r => r.grader),
		docTreeHash,
		model: mode === 'agent' ? builderName(task) : undefined,
	}
}

// ─── Agent mode ─────────────────────────────────────────────────────

const AGENT_TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_MS || 25 * 60 * 1000)

// The DECLARED builder contract (task.builder) → the CLI --model value. Friendly names map to
// explicit ids here — never guess CLI aliasing. AGENT_MODEL env overrides any declaration.
const BUILDER_MODELS: Record<string, string> = { sonnet: 'sonnet', opus: 'opus', fable: 'claude-fable-5' }

/** Resolve the builder model NAME for provenance ('fable', 'opus', env value, 'default'). */
export function builderName(task: Task): string {
	return process.env.AGENT_MODEL ?? task.builder ?? 'default'
}

/** Resolve the --model ARG for the spawn (undefined = let the CLI use its default). */
export function builderModelArg(task: Task): string | undefined {
	if (process.env.AGENT_MODEL) return process.env.AGENT_MODEL
	if (task.builder) return BUILDER_MODELS[task.builder]
	return undefined
}

/**
 * Spawns the eval agent headless in the throwaway worktree with SCOPED permissions —
 * never a blanket bypass: acceptEdits auto-approves file edits inside the tree, and
 * Bash is allowlisted to the build/inspect commands a feature build needs (bun tsc,
 * bun test, bun tsr, git reads). A timeout kills runaways; whatever state the tree is
 * in afterwards gets graded as-is — a half-finished feature failing graders IS the
 * measurement.
 */
const AGENT_ALLOWED_TOOLS = [
	'Bash(bun:*)',
	// Go builders run their own gates — without these they ship blind (measured:
	// go-projector-iter1's builder reported the sandbox blocked go build/test).
	'Bash(go:*)',
	'Bash(gofmt:*)',
	'Bash(cd:*)',
	'Bash(ls:*)',
	'Bash(grep:*)',
	'Bash(rg:*)',
	'Bash(find:*)',
	'Bash(git status:*)',
	'Bash(git diff:*)',
	'Bash(git log:*)',
].join(',')

/**
 * Headless one-shot agents sometimes ANSWER a brief-shaped prompt with a design document
 * instead of acting (observed: fe-notif-iter1/1b — excellent markdown plan, zero files).
 * The preamble pins the mode: execute, don't advise. The post-run no-change check makes a
 * do-nothing run loud instead of silently failing every grader.
 */
const ACT_PREAMBLE = `You are EXECUTING a feature build in this working tree — not advising, not planning.
Use your tools (Write/Edit/Bash) to implement it. If your final message describes a design
without the files existing on disk, you have failed the task.

SEEDED FILES ARE CANONICAL: any file the tree already contains from scaffolding (look for
SEEDED markers) must be COMPLETED in place — never rewritten, simplified or deleted; its
patterns are the grading rubric made code.

Work order: (1) READ the playbooks the task points you at (.claude/skills/<skill>/... and the
package CLAUDE.md — they are short and they ARE the grading rubric; code that ignores them
fails); (2) SCAFFOLD FIRST where a recipe exists — \`bun cli\` scaffolds BOTH frontend
artifacts (react routes, components, dialogs, forms) AND backend artifacts (bounded
contexts, entities, use cases, repositories, PROJECTIONS + PROJECTORS, controllers — see
docs/CLI.md and the skill's scaffold: line); run it and fill the emitted shape in;
hand-writing artifacts the CLI scaffolds is how house canons get missed; (3) then build; (4) SELF-CHECK
before finishing: run \`bun run detect\` at the repo root and FIX every finding your change
introduced (these are the same gates that grade you), then run the platform type-check the
task names. Your final message must name the playbooks you read, what you built, and the
self-check results.

THE TASK:
`

// Resume budget for silently-terminated builders (clean exit, no final message, partial
// tree). Infra kills mid-conversation are the dominant invalid-sample cause; one resume
// in the SAME worktree converts most of them into complete builds. Override: AGENT_RESUMES.
const AGENT_RESUMES = Number(process.env.AGENT_RESUMES ?? 1)

// Post-build gate enforcement: run the detect suite in the tree and spend one fix-resume
// on findings (0 disables). Self-check adherence measured voluntary-only — this makes it
// mechanical for every builder and model.
const GATE_FIX_ATTEMPTS = Number(process.env.GATE_FIX_ATTEMPTS ?? 1)

const RESUME_PREAMBLE = `A previous build attempt in this EXACT working tree was interrupted mid-flight.
The tree already contains a PARTIAL implementation of the task below. CONTINUE it to
completion — do NOT start over and do NOT duplicate existing files. Work order:
(1) inspect what exists (git status --porcelain, read the new/modified files);
(2) finish ONLY what is missing (registrations/wiring in files outside the new folders,
locale entries in BOTH languages, anything the playbooks demand that isn't there yet);
(3) run the finishing gates the task names (type-check etc.) and fix what they surface.
Your final message must say what already existed and what you completed.

THE TASK (for reference):
`

// L6 orchestrator preamble — the eval agent runs the FULL pipeline for an app-from-idea and
// dispatches worker subagents (it has the Task tool). It does NOT build a whole app in one
// context — that hits the capacity ceiling and drops the tail. Mirrors /build's agent-team model.
const ORCHESTRATOR_PREAMBLE = `You are the ORCHESTRATOR of an autonomous app build in this working tree — model + plan + DISPATCH. You implement NOTHING yourself.
MODEL SPLIT (enforced): YOU run on the stronger model and OWN ALL JUDGMENT — the bounded-context
decomposition (value-object-vs-aggregate calls), the contract design, the projection design. Make
every such decision YOURSELF in the model+plan phase and FREEZE it into each Task's handoff as an
explicit constraint (e.g. "List is a VALUE OBJECT on Space — create NO List repository/controller/
event"; "ListView and BoardView are TWO DISTINCT free-record projection classes, each with its own
projector consuming task events — NOT two queries over one shared table"). Dispatch each build worker
on SONNET (Task tool, model: sonnet) to EXECUTE its handoff — ESCALATE an individual handoff to
model: opus ONLY when its execution is genuinely hard (a gnarly aggregate with many invariants, a
cross-context migration); never dispatch workers on your own model. Workers FILL LOGIC into the
structure you decided — they NEVER re-make a modeling/decomposition decision. Judgment is yours (once, well);
execution is theirs (mechanical, parallel). A worker that invents an aggregate or a projection shape
you didn't specify is a handoff that under-constrained the decision — that is YOUR miss to prevent.
You have the Task tool. Build the app by running the FULL pipeline and fanning out to fresh-context workers:
(1) MODEL the bounded contexts (read .claude/skills/ddd-modeling + bounded-context). The invariant/
lifecycle boundary DOMINATES entity count — name each context after ONE aggregate's consistency
boundary, NEVER after the feature. Two aggregates with different lifecycles + their own invariants
are TWO contexts, not one. (Measured trap: a Kanban Board (stable, owns lists as VOs) and Card
(moved constantly, own move-invariant) are a \`board\` context AND a \`card\` context — a single
\`kanban\` context owning both is the god-context FAILURE.) No per-table sprawl either. AND the
INVERSE — don't OVER-model: a child with NO own lifecycle/invariants, only reached through its parent
(a Space's ordered Lists) is a VALUE OBJECT on the parent, NOT its own aggregate — give it no repo,
controller, use case or event. Ask of every entity: does it change on its own timeline + enforce its
own rules? No → value object.
(2) CONTRACT LOCK: author + freeze the cross-boundary enums + integration events in
packages/contracts (TypeSpec) and regenerate bindings (\`bun contracts\`) BEFORE building any context.
(3) PLAN: enumerate EVERY Task needed for the COMPLETE app — every aggregate, every command/endpoint
(create AND the secondary ones: list-creation, archive, move…), every projection, the full frontend,
AND the e2e spec. Give each Task a load-bearing handoff — **Consumes (frozen):** EXACT identifiers,
**Scope fence:**, **Gate:** (read .claude/commands/plan.md Task Structure + task-breakdown Step 4.5).
Topo-sort into waves (contract-lock-first). Keep the task list visible — you will check it off.
(4) DISPATCH a fresh worker subagent (Task tool) for EVERY Task — including the LAST ones (the e2e
spec, the secondary commands). You MUST NOT write implementation code in your own context; every
file is written by a dispatched worker. Give each worker its Task's handoff VERBATIM (it sees only
what you pass). Scaffold-first (\`bun cli\`). Parallel within a wave; gate each (tsc/detect) before
the next wave. THE #1 MEASURED FAILURE IS DROPPING THE TAIL — finishing the early waves and skipping
or self-stubbing the last Tasks (the realtime e2e assertion, the archive/list commands). Do not.
(5) BEFORE FINISHING: re-read your Task list from (3) and CONFIRM every Task was dispatched, returned,
and gated. Any Task not built by a worker is a failure. A STUBBED Task is also NOT built — an e2e
spec with a commented-out body / \`expect(true).toBe(true)\` / \`.skip\`, or a placeholder impl, must
be RE-DISPATCHED with the instruction "write it COMPLETE; e2e specs are graded by READING not
running, so author the real assertions even though you can't run Playwright here." Then SELF-CHECK:
\`bun run detect\` + the type-checks; dispatch a fix-worker for any finding.
Your final message must list the bounded contexts, the frozen contract, and — per Task — which worker
built it and its gate result (proving you dispatched, not self-built, and dropped nothing).

THE TASK:
`

async function spawnBuilder(
	prompt: string,
	treeRoot: string,
	budgetMs = AGENT_TIMEOUT_MS,
	extraTools: string[] = [],
	modelArg?: string,
): Promise<{ finalMessage: string; code: number }> {
	// Append per-task extra tools (e.g. L6's 'Task' for orchestrator fan-out) to the base allowlist.
	const allowedTools = extraTools.length > 0 ? `${AGENT_ALLOWED_TOOLS},${extraTools.join(',')}` : AGENT_ALLOWED_TOOLS
	// claude -p rejects argv containing null bytes; detector/tsc output can carry them
	// (e.g. a Bun.Glob ENOENT path on a stripped tree). Strip defensively before spawn.
	// biome-ignore lint/suspicious/noControlCharactersInRegex: matching the literal NUL byte IS the point here
	const safePrompt = prompt.replace(/\x00/g, '')
	const proc = Bun.spawn(
		[
			'claude',
			'-p',
			safePrompt,
			'--permission-mode',
			'acceptEdits',
			'--allowedTools',
			allowedTools,
			...(modelArg ? ['--model', modelArg] : []),
		],
		{
			cwd: treeRoot,
			stdout: 'pipe',
			stderr: 'inherit',
		},
	)
	const killer = setTimeout(() => {
		console.log('    agent timeout — killing; grading the tree as-is')
		proc.kill()
	}, budgetMs)
	// stdout is piped (not inherited) so the runner can inspect the final message:
	// `claude -p` prints only its final result, so buffering loses no live output.
	const [finalMessage, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
	clearTimeout(killer)
	return { finalMessage, code }
}

/** Sleep until the next usage-window boundary (5h grid, +5min), so a drained-window retry
 * lands on a refilled budget. Captures the operational logic previously trapped in shell
 * scripts (seq-all.sh et al). Returns immediately if already within 90s of a boundary. */
async function sleepToNextWindowBoundary(): Promise<void> {
	const now = new Date()
	const nowSec = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds()
	let best = Number.POSITIVE_INFINITY
	for (const h of [3, 8, 13, 18, 23]) {
		const target = h * 3600 + 45 * 60
		const delta = (target - nowSec + 86400) % 86400
		if (delta < best) best = delta
	}
	if (best < 90) return
	console.log(`    [window-retry] sleeping ${best}s to the next usage-window boundary`)
	await new Promise(r => setTimeout(r, best * 1000))
}

async function runAgentInTree(task: Task, treeRoot: string): Promise<boolean> {
	const budgetMs = task.timeoutMs ?? AGENT_TIMEOUT_MS
	const extraTools = task.extraTools ?? []
	const orchestrator = extraTools.includes('Task')
	console.log(
		`    spawning eval agent (claude -p, acceptEdits + scoped Bash${orchestrator ? ' + Task orchestrator' : ''}, ${budgetMs / 60000}min cap, cwd=${treeRoot})`,
	)
	let attempt = 0
	const preamble = orchestrator ? ORCHESTRATOR_PREAMBLE : ACT_PREAMBLE
	let { finalMessage, code } = await spawnBuilder(preamble + task.prompt, treeRoot, budgetMs, extraTools, builderModelArg(task))

	// A clean exit with an EMPTY final message is the silent-termination signature
	// (builder died mid-flight; the tree is a partial build). Resume in the SAME tree.
	while (code === 0 && finalMessage.trim() === '' && attempt < AGENT_RESUMES) {
		attempt++
		const partial = execSync('git status --porcelain', { cwd: treeRoot, encoding: 'utf8' }).trim()
		if (partial === '') break // nothing to resume — fall through to the no-changes warning
		console.log(`    ⚠ silent termination detected — resuming in the same tree (attempt ${attempt}/${AGENT_RESUMES})`)
		;({ finalMessage, code } = await spawnBuilder(RESUME_PREAMBLE + task.prompt, treeRoot, budgetMs, extraTools, builderModelArg(task)))
	}

	if (finalMessage.trim() !== '') process.stdout.write(finalMessage.endsWith('\n') ? finalMessage : `${finalMessage}\n`)
	if (code !== 0) console.log(`    agent exited ${code} — grading the tree as-is`)
	if (code === 0 && finalMessage.trim() === '') {
		console.log('    ⚠ agent produced NO final message (silent termination?) — treat this sample as suspect')
	} else if (attempt > 0) {
		console.log(`    agent resumed ${attempt} time(s) after silent termination — final attempt completed with a report`)
	}
	let changes = execSync('git status --porcelain', { cwd: treeRoot, encoding: 'utf8' }).trim()
	if (changes === '') {
		console.log('    ⚠ agent made NO changes to the tree (answered instead of building?) — graders will fail')
	} else {
		console.log(`    agent changed ${changes.split('\n').length} path(s)`)
	}

	// ── Completeness gate (orchestrator/L6 only) — the tail-drop guard ──
	// The correctness gate below validates what EXISTS; tail-drop produces a canon-clean
	// BACKEND while the frontend / SDK regen / projector / e2e are silently MISSING —
	// invisible to detect/tsc and to file-exists graders of files never created (a dropped
	// frontend has no file-exists grader at all). Measured (clean-branch L6, 2026-06): all
	// three apps built a full backend then dropped 100% of packages/app/react + the SDK regen
	// + the projector, despite a preamble that forbade it. The preamble is maxed on
	// exhortation; enforce it mechanically — detect the structural drops and RE-DISPATCH a
	// fresh worker for each until the tail exists, BEFORE the correctness gate runs.
	const COMPLETENESS_FIX_ATTEMPTS = Number(process.env.COMPLETENESS_FIX_ATTEMPTS ?? 2)
	if (orchestrator && changes !== '' && COMPLETENESS_FIX_ATTEMPTS > 0) {
		const e2eGrader = task.graders.find(g => g.kind === 'file-exists' && /\.spec\./.test(g.spec))
		const structuralGaps = (porcelain: string): string[] => {
			const touched = porcelain.split('\n').map(l => l.slice(3))
			const gaps: string[] = []
			if (!touched.some(f => f.startsWith('packages/app/react/src/routes/')))
				gaps.push(
					'FRONTEND DROPPED — no new files under packages/app/react/src/routes/: the whole frontend wave (route + data-owning section that owns its query + the realtime useServerEvents subscription + the create dialog) is missing.',
				)
			if (!touched.some(f => f.startsWith('packages/client/')))
				gaps.push(
					'SDK NOT REGENERATED — packages/client/ untouched: new controllers need `bun sdk` so the frontend gets typed hooks + query keys.',
				)
			if (!touched.some(f => /Projector\b/.test(f)))
				gaps.push('PROJECTOR DROPPED — no *Projector file: the read-model projection is never driven by events (find → applyEvent → save).')
			return gaps
		}
		for (let cAttempt = 0; cAttempt < COMPLETENESS_FIX_ATTEMPTS; cAttempt++) {
			const missing = structuralGaps(changes)
			if (e2eGrader) {
				try {
					const r = await runGrader(task, e2eGrader, treeRoot)
					if (!r.pass)
						missing.push(
							`E2E SPEC DROPPED — ${e2eGrader.spec} absent: author it COMPLETE (graded by READING not running; real assertions, no .skip / expect(true)).`,
						)
				} catch {}
			}
			if (missing.length === 0) {
				if (cAttempt > 0) console.log('    completeness gate: all required waves now present')
				break
			}
			console.log(
				`    completeness gate: ${missing.length} DROPPED deliverable(s) — re-dispatching the tail (attempt ${cAttempt + 1}/${COMPLETENESS_FIX_ATTEMPTS})`,
			)
			const tailPrompt = `Your build DROPPED THE TAIL. These REQUIRED deliverables are ABSENT (not buggy — MISSING entirely):
${missing.map(m => `  • ${m}`).join('\n')}
This is the #1 measured L6 failure and your orchestrator instructions forbade it. You are STILL the orchestrator.
DISPATCH a fresh-context worker (Task tool, model: sonnet) for EACH missing deliverable, each with its frozen
handoff (the Consumes/Scope-fence/Gate you authored in the plan) — do NOT implement inline. Build them now and
do NOT stop until every item above exists in the tree. Reply with which worker built each.`
			const fix = await spawnBuilder(tailPrompt, treeRoot, AGENT_TIMEOUT_MS, extraTools)
			if (fix.finalMessage.trim() !== '') process.stdout.write(`${fix.finalMessage.trim()}\n`)
			changes = execSync('git status --porcelain', { cwd: treeRoot, encoding: 'utf8' }).trim()
		}
	}

	// Runner-enforced gate check: self-check adherence is voluntary in the preamble, and
	// measured non-compliance (wave-A: only 2/4 builders ran detect; fx-wired shipped a
	// finding GPS-02 would have flagged) makes it mechanical — run the detect suite in the
	// tree and spend ONE fix-resume on the findings before grading.
	if (changes !== '' && GATE_FIX_ATTEMPTS > 0) {
		// Platform type-check inferred from the touched packages — a tsc-red tree wastes the
		// whole run slot (measured: fe-onboarding-iter3b shipped a non-compiling tree past a
		// detect-only gate check).
		const TSC_BY_PREFIX: Record<string, [string, string[]]> = {
			'packages/api/typescript/': ['packages/api/typescript', ['bun', 'x', 'tsc', '-p', 'tsconfig.build.json', '--noEmit']],
			'packages/app/react/': ['packages/app/react', ['bun', 'x', 'tsc', '--noEmit']],
			'packages/e2e/': ['packages/e2e', ['bun', 'x', 'tsc', '--noEmit']],
		}
		const touched = new Set(changes.split('\n').map(l => l.slice(3)))
		let tscFindings = ''
		for (const [prefix, [cwd, cmd]] of Object.entries(TSC_BY_PREFIX)) {
			if (![...touched].some(f => f.startsWith(prefix))) continue
			const r = Bun.spawnSync(cmd, { cwd: join(treeRoot, cwd), stdout: 'pipe', stderr: 'pipe' })
			if (r.exitCode !== 0) tscFindings += `\n--- tsc (${cwd}) ---\n${(r.stdout?.toString() ?? '').split('\n').slice(0, 20).join('\n')}`
		}
		// Typed lint (no-enum-widening et al) joins the gate for react-touching trees —
		// measured gap: fe-stateplace-iter5 widened a schema with the rule in-tree but
		// outside the builder's enforcement path.
		if ([...touched].some(f => f.startsWith('packages/app/react/'))) {
			const lint = Bun.spawnSync(['bun', 'x', 'eslint', '.', '--ext', 'ts,tsx', '--quiet'], {
				cwd: join(treeRoot, 'packages/app/react'),
				stdout: 'pipe',
				stderr: 'pipe',
			})
			if (lint.exitCode !== 0)
				tscFindings += `\n--- eslint (packages/app/react) ---\n${(lint.stdout?.toString() ?? '').split('\n').slice(0, 15).join('\n')}`
		}
		// The task's OWN mechanical graders join the gate — builders iterate against their
		// actual rubric (measured: iter8 kept the seeded canon but ADDED a parallel
		// FormValues type that a grep-must-not bans; detect/tsc can't see task rubric).
		let rubricFindings = ''
		for (const g of task.graders) {
			if (g.kind !== 'grep-must' && g.kind !== 'grep-must-not' && g.kind !== 'file-exists') continue
			try {
				const r = await runGrader(task, g, treeRoot)
				if (!r.pass) rubricFindings += `\n[rubric] ${graderLabel(g)}: ${r.detail.split('\n')[0]}`
			} catch {}
		}
		const detect = Bun.spawnSync(['bun', 'run', 'detect'], { cwd: treeRoot, stdout: 'pipe', stderr: 'pipe' })
		if (detect.exitCode !== 0 || tscFindings !== '' || rubricFindings !== '') {
			const findings =
				`${detect.stdout?.toString() ?? ''}\n${detect.stderr?.toString() ?? ''}`.trim().split('\n').slice(-25).join('\n') +
				tscFindings +
				rubricFindings
			console.log('    gate check: gates FAILED (detect/tsc/rubric) — spending a fix-resume on the findings')
			const fixPrompt = `Your build in this working tree fails the repo's mechanical gates (\`bun run detect\`).
FINDINGS (fix every one — detectors, type-check AND the task's own grading rubric):
${findings}

Fix the findings, re-run \`bun run detect\` until it exits 0, then re-run the task's
finishing type-check. Reply with what you fixed.`
			const fix = await spawnBuilder(fixPrompt, treeRoot)
			if (fix.finalMessage.trim() !== '') process.stdout.write(`${fix.finalMessage.trim()}\n`)
			const recheck = Bun.spawnSync(['bun', 'run', 'detect'], { cwd: treeRoot, stdout: 'pipe', stderr: 'pipe' })
			console.log(
				recheck.exitCode === 0
					? '    gate check: clean after fix-resume'
					: '    gate check: STILL failing after fix-resume — grading as-is',
			)
		} else {
			console.log('    gate check: detect clean')
		}
	}
	// false = the builder produced NOTHING (a drained-window no-op) — the caller may retry.
	return changes !== ''
}

// ─── Scoreboard ─────────────────────────────────────────────────────

/**
 * THE one place the patch layout is defined — a pure function of (stamp, task id):
 * `<dir>/<stamp>--<taskId>.patch`, same stem convention as the `.jsonl`, so a ScoreRow
 * found in `<stamp>.jsonl` maps to its archived build via `patchPath(<stamp>, row.task)`.
 * Consumers (the promotion pipeline — scripts/examples/promote.ts) import this function;
 * nothing re-derives the name.
 */
export function patchPath(stamp: string, taskId: string, dir = SCOREBOARD_DIR): string {
	return join(dir, `${stamp}--${taskId}.patch`)
}

/**
 * Archives the tree's uncommitted build as ONE patch for (stamp, task) — a re-run of the
 * same pair REPLACES the file, never appends. A concatenated patch re-states its hunks and
 * stops being `git apply`-able, which broke the 1:1 (stamp, task) → patch mapping the
 * promotion pipeline depends on. `git diff --output=<file>` writes (and truncates) the
 * destination directly — replace semantics come from git itself, with no stdout buffering.
 */
export function archivePatch(treeRoot: string, stamp: string, taskId: string, dir = SCOREBOARD_DIR): { path: string; bytes: number } {
	const path = patchPath(stamp, taskId, dir)
	mkdirSync(dir, { recursive: true })
	execFileSync('git', ['add', '-A'], { cwd: treeRoot })
	execFileSync('git', ['diff', '--cached', '--binary', `--output=${path}`], { cwd: treeRoot })
	return { path, bytes: statSync(path).size }
}

function resolveStamp(explicit: string | undefined, mode: RunMode): string {
	if (explicit) return explicit
	// Derived from HEAD, not Date.now — re-runs at the same sha get a -n suffix.
	const sha = git('rev-parse --short HEAD')
	let stamp = `${mode}-${sha}`
	for (let n = 2; existsSync(join(SCOREBOARD_DIR, `${stamp}.jsonl`)); n++) stamp = `${mode}-${sha}-${n}`
	return stamp
}

// ─── CLI ────────────────────────────────────────────────────────────

const HELP = `skill-evals runner — grades task trees against their graders.

Usage:
  bun scripts/skill-evals/run.ts --gold [task-ids... | --all-train] [--stamp S]
  bun scripts/skill-evals/run.ts --agent <task-ids...> [--stamp S]     (EXPERIMENTAL)

Modes:
  --gold        Worktree each task's goldRef under $TMPDIR, run every grader against it,
                append one ScoreRow per task to scoreboard/<stamp>.jsonl. Gold must score
                100%: any failing grader on gold is a GRADER bug → exit 1.
  --agent       EXPERIMENTAL — worktree at baseRef, spawn
                'claude -p <task.prompt> --permission-mode acceptEdits' with cwd in the
                tree, then grade. Scaffolding only; not part of any verified flow yet.

Selection:
  task-ids...   Positional ids matching tasks/*.yaml entries.
  --all-train   All tasks with tier: train.

Options:
  --stamp S     Scoreboard file stem (default: <mode>-<HEAD short sha>[-n]).
  --help        This text.`

async function main(): Promise<number> {
	const { values, positionals } = parseArgs({
		args: process.argv.slice(2),
		options: {
			gold: { type: 'boolean', default: false },
			agent: { type: 'boolean', default: false },
			'all-train': { type: 'boolean', default: false },
			stamp: { type: 'string' },
			'stamp-per-task': { type: 'boolean', default: false },
			'window-retry': { type: 'boolean', default: false },
			help: { type: 'boolean', default: false },
		},
		allowPositionals: true,
	})

	if (values.help || (!values.gold && !values.agent)) {
		console.log(HELP)
		return values.help ? 0 : 2
	}
	if (values.gold && values.agent) {
		console.error('pick one mode: --gold or --agent')
		return 2
	}
	const mode: RunMode = values.gold ? 'gold' : 'agent'

	const tasks = loadTasks()
	let selected: Task[]
	if (values['all-train']) {
		selected = tasks.filter(t => t.tier === 'train')
	} else {
		const wanted = new Set(positionals)
		selected = tasks.filter(t => wanted.has(t.id))
		const missing = positionals.filter(id => !selected.some(t => t.id === id))
		if (missing.length > 0) {
			console.error(`unknown task id(s): ${missing.join(', ')} — known: ${tasks.map(t => t.id).join(', ') || '(none)'}`)
			return 2
		}
	}
	if (selected.length === 0) {
		console.error('no tasks selected — pass task ids or --all-train (and author tasks/*.yaml first)')
		return 2
	}

	const docTreeHash = computeDocTreeHash()
	const stamp = resolveStamp(values.stamp, mode)
	const perTask = values['stamp-per-task'] === true
	const windowRetry = values['window-retry'] === true
	mkdirSync(SCOREBOARD_DIR, { recursive: true })
	console.log(
		`mode=${mode}  tasks=${selected.length}  docTreeHash=${docTreeHash}  stamp=${stamp}${perTask ? ' (per-task)' : ''}${windowRetry ? '  window-retry=on' : ''}\n`,
	)

	const rows: ScoreRow[] = []
	for (const task of selected) {
		// --stamp-per-task: each task gets its own scoreboard + patch file (clean queues),
		// instead of all selected tasks appending to one shared <stamp>.jsonl.
		const taskStamp = perTask ? `${stamp}-${task.id}` : stamp
		const scoreboardPath = join(SCOREBOARD_DIR, `${taskStamp}.jsonl`)
		// Holdout/synthetic tasks ship with an empty baseRef — they build from the current HEAD.
		const ref = (mode === 'gold' ? task.goldRef : task.baseRef) || 'HEAD'
		console.log(`▶ ${task.id} [${task.tier}] ${task.title}  (${mode} @ ${ref})`)
		let builderChanged = true
		const runOnce = () =>
			withWorktree(ref, async treeRoot => {
				injectFiles(task, treeRoot)
				if (mode === 'agent' && task.seedCommands?.length) {
					for (const cmd of task.seedCommands) {
						const r = Bun.spawnSync(['sh', '-c', cmd], { cwd: treeRoot, stdout: 'pipe', stderr: 'pipe' })
						console.log(
							r.exitCode === 0
								? `    seeded: ${cmd}`
								: `    ⚠ seed failed (${r.exitCode}): ${cmd}\n${(r.stderr?.toString() ?? '').split('\n').slice(0, 5).join('\n')}`,
						)
					}
				}
				if (mode === 'agent') builderChanged = await runAgentInTree(task, treeRoot)
				const graded = await gradeTree(task, treeRoot)
				if (mode === 'agent') {
					// Archive the build as a patch BEFORE the tree is destroyed — the variant
					// inventory for canon crystallization, and the only durable copy of the code.
					// One patch per (stamp, task): a re-run REPLACES it (see archivePatch).
					try {
						const { path, bytes } = archivePatch(treeRoot, taskStamp, task.id)
						console.log(`    build archived → scoreboard/${basename(path)} (${Math.round(bytes / 1024)}kb)`)
					} catch (err) {
						console.log(`    ⚠ patch archive failed: ${err}`)
					}
				}
				return graded
			})
		let results = await runOnce()
		// --window-retry: a builder that produced NOTHING is the drained-usage-window
		// signature (it exits instantly). Sleep to the next 5h boundary and retry ONCE on a
		// refilled budget — the operational guard previously living in ad-hoc shell scripts.
		if (windowRetry && mode === 'agent' && !builderChanged) {
			await sleepToNextWindowBoundary()
			console.log(`    [window-retry] re-running ${task.id} on the refilled window`)
			results = await runOnce()
		}
		const row = toScoreRow(task, mode, results, docTreeHash)
		appendFileSync(scoreboardPath, `${JSON.stringify(row)}\n`)
		rows.push(row)
	}

	// ── Summary table ──
	const idWidth = Math.max(4, ...rows.map(r => r.task.length))
	console.log(`\n${'task'.padEnd(idWidth)}  result  failed graders`)
	console.log(`${'─'.repeat(idWidth)}  ──────  ${'─'.repeat(40)}`)
	for (const row of rows) {
		console.log(`${row.task.padEnd(idWidth)}  ${row.pass ? 'PASS  ' : 'FAIL  '}  ${row.failedGraders.join(', ') || '—'}`)
	}
	const failures = rows.filter(r => !r.pass).length
	// NB: the per-task `scoreboardPath` (line ~573) is loop-scoped — referencing it here threw a
	// ReferenceError that crashed every run AT THE SUMMARY (after rows were already written, so the
	// data survived but --window-retry never looped and multi-agent runs exited early). Use the
	// function-scope stamp + dir to describe the output for both single-stamp and per-task modes.
	console.log(`\n${rows.length - failures}/${rows.length} task(s) at 100% — scoreboard: ${join(SCOREBOARD_DIR, stamp)}*.jsonl`)

	if (mode === 'gold' && failures > 0) {
		console.error(
			'\ngold trees must score 100% — a failing grader on gold is a grader bug. Fix the grader (or the task spec), not the gold tree.',
		)
		return 1
	}
	return 0
}

if (import.meta.main) process.exit(await main())
