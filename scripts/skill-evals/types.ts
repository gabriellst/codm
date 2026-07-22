/**
 * types.ts — shared contracts of the skill-evals harness.
 *
 * Pure types only: no I/O, no clocks (ScoreRow.ts is caller-supplied — run.ts
 * stamps it; nothing in this module or graders.ts calls Date.now).
 */

// ─── Task (mirrors the tasks/*.yaml shape) ──────────────────────────

export type Tier = 'train' | 'holdout'

export type GraderKind = 'tsc' | 'detect' | 'grep-must' | 'grep-must-not' | 'file-exists' | 'test-green' | 'judge' | 'cmd'

export interface GraderSpec {
	kind: GraderKind
	/**
	 * Kind-specific payload:
	 *   tsc          → 'backend' | 'app-react'
	 *   detect       → detector name + optional extra args ('registry-scan', 'import-direction --all', 'slice-closure')
	 *   grep-must(-not) → '<glob>::<regex>' (split on the FIRST '::'; regex compiled with the m flag)
	 *   file-exists  → '<glob>'
	 *   test-green   → test path passed to `bun test` (backend paths run from packages/api/typescript)
	 */
	spec: string
	/** Stable label for scoreboards; defaults to `${kind}:${spec}`. */
	id?: string
	/**
	 * judge-only — the model the rubric judge runs as. Defaults to `JUDGE_MODEL || 'haiku'`.
	 * Set `sonnet` for HEAVY rubrics (precision+recall over many items, e.g. the L3
	 * review-judgment 6-violations+4-traps rubric, L4 spec/planning modeling rubrics) where
	 * haiku mis-grades an unambiguously-correct artifact — a weak-oracle instrument failure,
	 * not a signal about the tree. Ignored by non-judge kinds.
	 */
	model?: string
}

export interface Task {
	/** Commands the RUNNER executes in the tree BEFORE the builder spawns (scaffold seeding —
	 * the production flow: artifacts arrive canonical, the builder fills them). `sh -c` each,
	 * cwd = tree root; failures warn but don't abort. */
	seedCommands?: string[]
	/** Per-task builder budget override (ms) — heavy probes (wizards, composition) declare it. */
	timeoutMs?: number
	id: string
	tier: Tier
	title: string
	/** Provenance: the .specs/ document this task was distilled from. */
	sourceSpec: string
	/** Commit sha of the reference (human/gold) solution — gold mode grades this tree. */
	goldRef: string
	/** Commit sha the agent starts from — agent mode worktrees check this out. */
	baseRef: string
	/** The prompt handed to the agent in agent mode. */
	prompt: string
	/** DECLARED builder model for agent mode. 'fable' = the orchestrator tier (l6 probes — the
	 *  builder itself dispatches sonnet/opus workers via Task); 'opus' = hard single-context
	 *  builds and judgment probes; 'sonnet' = routine citizen builds. Absent = the CLI default.
	 *  AGENT_MODEL env overrides everything (operator escape hatch). */
	builder?: 'sonnet' | 'opus' | 'fable'
	/** Doc-tree axes this task exercises (skill names, registry ids, doc sections). */
	axes: string[]
	graders: GraderSpec[]
	/**
	 * Files copied into the worktree BEFORE the agent runs (feature-loop tasks: the
	 * verifier's red acceptance tests + spec live in the main repo, outside packages/,
	 * and get seeded into the tree at run time — failing tests never touch the branch).
	 * `from` is main-repo-relative, `to` is tree-relative.
	 */
	inject?: { from: string; to: string }[]
	/**
	 * Extra `--allowedTools` entries appended to the base allowlist for THIS task's agent.
	 * The L6 app-from-idea probe sets `['Task']` so the eval agent can act as a /build-style
	 * orchestrator and dispatch worker subagents (verified viable headless in a $TMPDIR worktree).
	 * Default omitted → single-context builder, no fan-out.
	 */
	extraTools?: string[]
	notes?: string
}

// ─── Results ────────────────────────────────────────────────────────

export interface GradeResult {
	/** Task id. */
	task: string
	/** Grader label (GraderSpec.id ?? `${kind}:${spec}`). */
	grader: string
	pass: boolean
	/** Human-readable evidence: command + exit code, matched files, tail of output. */
	detail: string
}

export type RunMode = 'gold' | 'agent'

/** One scoreboard line (JSONL). `ts` is supplied by the caller — never computed here. */
export interface ScoreRow {
	ts: string
	task: string
	mode: RunMode
	pass: boolean
	failedGraders: string[]
	/** Hash of the MAIN repo's doc tree (.claude/skills + .claude/registry.yaml + docs/) at run time. */
	docTreeHash: string
	/** Builder model for agent mode ('default' = the CLI's configured model; absent for gold mode). */
	model?: string
}
