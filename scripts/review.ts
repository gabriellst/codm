#!/usr/bin/env bun
/**
 * review.ts  — Batch file review using Claude Code agents
 *
 * Usage:
 *   bun scripts/review.ts                            # Review all changed files (git diff)
 *   bun scripts/review.ts  --all                     # Review ALL project .ts/.tsx files
 *   bun scripts/review.ts  --context catalog         # Review only files in a bounded context
 *   bun scripts/review.ts  --staged                  # Review only staged files
 *   bun scripts/review.ts  --pr                      # Review files changed in current branch vs dev
 *   bun scripts/review.ts  --pr --base main          # Review files changed vs custom base branch
 *   bun scripts/review.ts  --branches feat/a feat/b  # Review multiple branches independently
 *   bun scripts/review.ts  file1.ts file2.ts         # Review specific files
 *
 * Scope filters:
 *   --backend                  # Only api/src files
 *   --backend --all            # All backend .ts files
 *   --backend --context catalog # Only api/src/catalog/** files
 *   --frontend                 # Only app/src files
 *   --frontend --all           # All frontend .tsx/.ts files
 *   --frontend --context products # Only app/src/routes/products/** files
 *
 * Options:
 *   --parallel N    Max parallel reviews (default: 1)
 *   --batch-token-budget N  Approx. max tokens per review batch (default: 20000)
 *   --model MODEL   Claude model to use (default: sonnet). Accepts shortnames
 *                   (haiku, sonnet, opus) or full IDs (claude-sonnet-5, etc).
 *   --thorough      Use opus instead of sonnet
 *   --output DIR    Save reports to directory (default: prints to stdout)
 *   --no-batch      Review files individually instead of batching by skill type
 *   --no-cascade    Skip cascade impact analysis at the end
 *   --with-graph    Run a second, graph-grounded logic-bug pass (see below)
 *   --rebuild-graph Force-rebuild .graph/graph.json before the graph pass
 *   --graph-depth N            Blast-radius BFS depth (default: 3)
 *   --graph-max-downstream N   Cap on downstream nodes per file (default: 50)
 *   --dry-run       Show what would be reviewed without running
 *
 * Token optimizations (v5 — single-pass, no tools):
 *   - Registries compiled locally into compact checklists before prompt build
 *   - Single-pass review: files inlined in prompt, failures-only output (no P/N)
 *   - No tool usage: source + deps inlined directly, zero tool framing overhead
 *   - Output schema: 4 fields per failure (severity, lines, problem, fix)
 *   - Cascade analysis auto-skips when no multi-layer cascade is possible
 *
 * Cascade analysis:
 *   After all reviews, parses violations and traces import dependencies
 *   bottom-up through the architecture layers to find root causes.
 *   Outputs _cascade-analysis.md with fix order starting from fundamentals.
 *
 * Graph-aware logic-bug pass (--with-graph, opt-in):
 *   The checklist pass above answers "does this violate a documented rule?"
 *   It has no way to confirm whether a violation (or a subtler bug outside
 *   the checklist) actually breaks anything downstream — it only sees each
 *   file's inlined static imports. --with-graph adds a second, separate LLM
 *   call per batch that instead receives the real dependency graph's blast
 *   radius for each touched file (scripts/graph — upstream dependents,
 *   downstream consumers, raises-event/handles-event and reads/writes-table
 *   edges). The prompt requires every cross-file claim to cite a concrete
 *   node/edge from that payload — it may not invent a caller, consumer, or
 *   downstream effect the graph doesn't show. This targets real logic bugs
 *   with a concrete failure scenario, not style/convention (already covered
 *   by the checklist pass) and not speculative cross-file guesses. Only
 *   files that resolve to at least one graph node get this pass; roughly
 *   doubles LLM cost for those files, so it's opt-in rather than default.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs'
import { resolve, basename, dirname } from 'node:path'
import { parseArgs } from 'node:util'
import { REPO } from '../template.config'
import { detectLang, globalRegistry, type SkillLang } from './lib/repo-model'
import { build as buildGraph, writeOutputs as writeGraphOutputs } from './graph/core/builder'
import { GRAPH_JSON } from './graph/core/paths'
import type { FastQueryContext } from './graph/core/index-cache'
import { loadQueryContext, reviewBatch as graphReviewBatch, formatReviewBatch, type ReviewBatchResult } from './graph/core/review-query'

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname)
const PROJECT_ROOT = process.env.REVIEW_PROJECT_ROOT || resolve(SCRIPT_DIR, '..')

// ─── Polyglot layout roots ──────────────────────────────────────────
// The on-disk prefixes the review pipeline resolves against — sourced from
// template.config.ts (the ONE file that knows this repo's layout/identity).
// Backend TS lives under REPO.workspaceRoots.apiTs; each frontend target
// keeps its own src root. These MUST carry the real packages/ prefix — the
// dependency inliner (getReviewReadPlan / resolveImportedDependencies) and
// the cascade grapher compare classified.file (a repo-relative path) against
// them, so a bare 'api/src' / 'app/src' would silently match nothing and
// leave every support file un-inlined (the dead-inlining bug this layout fixes).
const BACKEND_TS_ROOT = REPO.workspaceRoots.apiTs
const APP_SRC_ROOTS = [REPO.workspaceRoots.appReact, `${REPO.packageRoots.appExpo}/src`, REPO.workspaceRoots.appAstro]

// ─── Types ──────────────────────────────────────────────────────────

interface Options {
	mode: 'diff' | 'staged' | 'all' | 'pr'
	prBase: string
	branches: string[]
	scope: 'all' | 'frontend' | 'backend'
	parallel: number
	batchTokenBudget: number
	model: string
	outputDir: string
	print: boolean
	batchMode: boolean
	dryRun: boolean
	noCascade: boolean
	withGraph: boolean
	rebuildGraph: boolean
	graphDepth: number
	graphMaxDownstream: number
	contextFilter: string
	files: string[]
}

// SkillLang comes from scripts/lib/repo-model.ts — derived from REPO.workspaces (CLAUDE.md §5:
// language is a workspace property, never a tool-local union).

interface ClassifiedFile {
	artifact: string
	skill: string
	lang: SkillLang
	file: string
}

interface Violation {
	id: string
	severity: string
	lines: string
	problem: string
	fix: string
}

interface FileReview {
	file: string
	artifact: string
	layer: number
	violations: Violation[]
}

interface ChecklistEntry {
	id: string
	kind: 'pattern' | 'bad_practice' | 'cross_cutting'
	name: string
	when?: string
	appliesTo?: string
	severity?: string
	rule?: string
	wrong?: string
	right?: string
	alwaysFlagWhen?: string
	note?: string
}

interface CompiledChecklist {
	skill: string
	lang: SkillLang
	artifact: string
	patterns: ChecklistEntry[]
	badPractices: ChecklistEntry[]
	crossCutting: ChecklistEntry[]
	all: ChecklistEntry[]
	compactText: string
}

interface ReviewReadPlan {
	file: string
	supportFiles: string[]
	fileTokens: number
	supportTokens: number
}

interface CheckVerdict {
	id: string
	v: 'P' | 'F'
}

interface SinglePassFileResult {
	file: string
	artifact: string
	reasoning: CheckVerdict[]
	failures: Violation[]
}

interface SinglePassBatchResult {
	reviews: SinglePassFileResult[]
}

interface ReviewBatch {
	skill: string
	lang: SkillLang
	artifact: string
	files: ClassifiedFile[]
	estimatedTokens: number
}

// ─── Graph-aware pass types ─────────────────────────────────────────

interface GraphFinding {
	severity: string
	lines: string
	problem: string
	fix: string
	citedNodes: string[]
}

interface GraphAwareFileResult {
	file: string
	findings: GraphFinding[]
}

interface GraphAwareBatchResult {
	reviews: GraphAwareFileResult[]
}

// ─── Parse Arguments ────────────────────────────────────────────────

function parseOptions(): Options {
	const { values, positionals } = parseArgs({
		args: Bun.argv.slice(2),
		options: {
			all: { type: 'boolean', default: false },
			staged: { type: 'boolean', default: false },
			pr: { type: 'boolean', default: false },
			base: { type: 'string', default: 'dev' },
			branches: { type: 'boolean', default: false },
			frontend: { type: 'boolean', default: false },
			backend: { type: 'boolean', default: false },
			context: { type: 'string', default: '' },
			parallel: { type: 'string', default: '1' },
			'batch-token-budget': { type: 'string', default: '20000' },
			model: { type: 'string', default: 'sonnet' },
			thorough: { type: 'boolean', default: false },
			output: { type: 'string', default: '' },
			'no-batch': { type: 'boolean', default: false },
			'no-cascade': { type: 'boolean', default: false },
			'with-graph': { type: 'boolean', default: false },
			'rebuild-graph': { type: 'boolean', default: false },
			'graph-depth': { type: 'string', default: '3' },
			'graph-max-downstream': { type: 'string', default: '50' },
			'dry-run': { type: 'boolean', default: false },
			print: { type: 'boolean', default: false },
			help: { type: 'boolean', short: 'h', default: false },
		},
		allowPositionals: true,
		strict: true,
	})

	if (values.help) {
		console.log(`review.ts  — Batch file review using Claude Code agents

Usage:
  bun scripts/review.ts                            # Review all changed files (git diff)
  bun scripts/review.ts  --all                     # Review ALL project .ts/.tsx files
  bun scripts/review.ts  --staged                  # Review only staged files
  bun scripts/review.ts  --pr                      # Review files changed in current branch vs dev
  bun scripts/review.ts  --pr --base main          # Review files changed vs custom base branch
  bun scripts/review.ts  --branches feat/a feat/b  # Review multiple branches independently
  bun scripts/review.ts  file1.ts file2.ts         # Review specific files

Scope filters:
  --backend                    Only api/src files
  --backend --all              All backend .ts files
  --backend --context catalog  Only api/src/catalog/** files
  --frontend                   Only app/src files
  --frontend --all             All frontend .tsx/.ts files
  --frontend --context products Only app/src/routes/products/** files

Options:
  --pr            Review files changed in current branch vs base branch
  --base BRANCH   Base branch for --pr/--branches mode (default: dev)
  --branches B..  Review multiple branches independently (uses worktrees)
  --context NAME  Filter by bounded context (backend) or route (frontend)
  --parallel N    Max parallel reviews (default: 1)
  --batch-token-budget N  Approx. max tokens per review batch (default: 20000)
  --model MODEL   Claude model (default: sonnet). Accepts shortnames
                  (haiku, sonnet, opus) or full IDs.
  --thorough      Use opus instead of sonnet
  --output DIR    Save reports to directory (default: prints to stdout)
  --print         Print report to stdout only — no file writes, progress to stderr
  --no-batch      Review files individually instead of batching by skill type
  --no-cascade    Skip cascade impact analysis at the end
  --with-graph    Run a second graph-grounded logic-bug pass (opt-in)
  --rebuild-graph Force-rebuild .graph/graph.json before the graph pass
  --graph-depth N            Blast-radius BFS depth (default: 3)
  --graph-max-downstream N   Cap on downstream nodes per file (default: 50)
  --dry-run       Show what would be reviewed without running`)
		process.exit(0)
	}

	return {
		mode: values.all ? 'all' : values.staged ? 'staged' : values.pr ? 'pr' : 'diff',
		prBase: values.base!,
		branches: values.branches ? positionals : [],
		scope: values.frontend ? 'frontend' : values.backend ? 'backend' : 'all',
		parallel: Number.parseInt(values.parallel!, 10),
		batchTokenBudget: Number.parseInt(values['batch-token-budget']!, 10),
		model: resolveModel(values.thorough ? 'opus' : values.model!),
		outputDir: values.output!,
		print: values.print!,
		batchMode: !values['no-batch'],
		noCascade: values['no-cascade']!,
		withGraph: values['with-graph']!,
		rebuildGraph: values['rebuild-graph']!,
		graphDepth: Number.parseInt(values['graph-depth']!, 10),
		graphMaxDownstream: Number.parseInt(values['graph-max-downstream']!, 10),
		dryRun: values['dry-run']!,
		contextFilter: values.context!,
		files: values.branches ? [] : positionals,
	}
}

// ─── Model alias resolution ─────────────────────────────────────────

const MODEL_ALIAS: Record<string, string> = {
	haiku: 'claude-haiku-4-5-20251001',
	sonnet: 'claude-sonnet-5',
	opus: 'claude-opus-4-8',
}

function resolveModel(m: string): string {
	return MODEL_ALIAS[m] ?? m
}

// ─── Shell helper ───────────────────────────────────────────────────

async function exec(cmd: string[]): Promise<string> {
	const proc = Bun.spawn(cmd, { cwd: PROJECT_ROOT, stdout: 'pipe', stderr: 'ignore' })
	const text = await new Response(proc.stdout).text()
	await proc.exited
	return text.trim()
}

// ─── Collect files ──────────────────────────────────────────────────

// Both declared backends — the Go source root reviews through the go/ skill variants exactly like
// the TS root reviews through typescript/. A scope that silently drops a whole backend is the
// review-skipped-silently class the taxonomy unification exists to kill.
const BACKEND_ROOTS = [BACKEND_TS_ROOT, REPO.workspaceRoots.apiGo]

function getScopeDirs(scope: Options['scope']): string[] {
	// Polyglot layout (template.config.ts): backend code lives under
	// REPO.workspaceRoots.apiTs (TS) / .apiGo (Go); frontends under the
	// per-target src roots in APP_SRC_ROOTS.
	switch (scope) {
		case 'frontend':
			return [...APP_SRC_ROOTS]
		case 'backend':
			return [...BACKEND_ROOTS]
		default:
			return [...BACKEND_ROOTS, ...APP_SRC_ROOTS]
	}
}

function matchesScope(file: string, scope: Options['scope']): boolean {
	if (scope === 'all') return true
	if (scope === 'frontend') return file.startsWith('packages/app/')
	return BACKEND_ROOTS.some(root => file.startsWith(root))
}

async function collectFiles(opts: Options): Promise<string[]> {
	if (opts.files.length > 0) return opts.files

	let lines: string[] = []

	switch (opts.mode) {
		case 'diff': {
			const [diffHead, diffCached, untracked] = await Promise.all([
				exec(['git', 'diff', '--name-only', 'HEAD']),
				exec(['git', 'diff', '--name-only', '--cached']),
				exec(['git', 'ls-files', '--others', '--exclude-standard']),
			])
			lines = [diffHead, diffCached, untracked].flatMap(s => s.split('\n')).filter(f => matchesScope(f, opts.scope))
			break
		}
		case 'staged': {
			const out = await exec(['git', 'diff', '--name-only', '--cached'])
			lines = out.split('\n').filter(f => matchesScope(f, opts.scope))
			break
		}
		case 'pr': {
			// Always prefer origin/<base> for reliable diff (works in worktrees too)
			const originRef = `origin/${opts.prBase}`
			const originExists = await exec(['git', 'rev-parse', '--verify', originRef])
			const ref = originExists ? originRef : opts.prBase
			const out = await exec(['git', 'diff', '--name-only', `${ref}...HEAD`])
			lines = out.split('\n').filter(f => matchesScope(f, opts.scope))
			break
		}
		case 'all': {
			const dirs = getScopeDirs(opts.scope).filter(d => existsSync(resolve(PROJECT_ROOT, d)))
			const out = await exec(['find', ...dirs, '-type', 'f', '(', '-name', '*.ts', '-o', '-name', '*.tsx', '-o', '-name', '*.go', ')'])
			lines = out.split('\n')
			break
		}
	}

	return [...new Set(lines.filter(Boolean))]
}

// ─── Classify file → artifact + skill ───────────────────────────────
//
// Language resolution is repo-model's detectLang: the workspace that CONTAINS the file decides
// (REPO.workspaces[*].lang), with extension fallbacks only outside declared workspaces.
// The `<skill>/<lang>/registry.yaml` is preferred; falls back to `<skill>/registry.yaml` for
// skills that don't have language variants yet (resolveRegistryPath, existsSync-decided).

const BACKEND_EXT = '(?:\\.ts|\\.tsx|\\.go)'

// Exported for the taxonomy-parity gate (scripts/taxonomy-parity.test.ts): every artifact named
// here must exist as a component in .claude/registry.yaml, and every reviewable yaml component
// must have a rule — that parity is what kills the "jobs/ silently dropped" class for good.
export const CLASSIFICATION_RULES: Array<{ match: RegExp; artifact: string; skill: string }> = [
	// Drizzle schema lives only on the TS side (contracts package)
	{ match: /(?:contracts|shared)\/db\/(?:drizzle\/)?schema\/[^/]+\.ts$/, artifact: 'db-schema', skill: 'db-modelling' },

	// BFF / query slice — typescript only (per ownership matrix § polyglot.md §3)
	{ match: new RegExp(`ui/controllers/.*${BACKEND_EXT}$`), artifact: 'query', skill: 'query' },
	{ match: new RegExp(`ui/usecases/.*${BACKEND_EXT}$`), artifact: 'query', skill: 'query' },

	// Per-context primitives — match across both backends (ts + go)
	{ match: new RegExp(`controllers/.*${BACKEND_EXT}$`), artifact: 'controller', skill: 'controller' },
	{ match: new RegExp(`objects/.*${BACKEND_EXT}$`), artifact: 'value-object', skill: 'value-object' },
	{ match: new RegExp(`entities/.*${BACKEND_EXT}$`), artifact: 'entity', skill: 'entity' },
	{ match: new RegExp(`usecases/.*${BACKEND_EXT}$`), artifact: 'usecase', skill: 'usecase' },
	{ match: new RegExp(`repositories/.*${BACKEND_EXT}$`), artifact: 'repository', skill: 'repository' },
	{ match: new RegExp(`errors/.*${BACKEND_EXT}$`), artifact: 'errors', skill: 'errors' },
	{ match: new RegExp(`services/.*${BACKEND_EXT}$`), artifact: 'service', skill: 'service' },
	{ match: new RegExp(`events/.*${BACKEND_EXT}$`), artifact: 'event', skill: 'event' },
	{ match: new RegExp(`handlers/.*${BACKEND_EXT}$`), artifact: 'handler', skill: 'handler' },
	// Jobs are handler-shaped (a thin Handler that orchestrates a sweep) — review with the handler
	// checklist. Without this rule classifyFile returned null and jobs were SILENTLY dropped from review.
	{ match: new RegExp(`jobs/.*${BACKEND_EXT}$`), artifact: 'job', skill: 'handler' },
	{ match: new RegExp(`projections/projectors/.*${BACKEND_EXT}$`), artifact: 'projector', skill: 'projector' },
	{ match: new RegExp(`projections/.*${BACKEND_EXT}$`), artifact: 'projection', skill: 'projection' },
	{ match: new RegExp(`(?:middleware|middlewares)/.*${BACKEND_EXT}$`), artifact: 'middleware', skill: 'middleware' },
	{ match: /schemas\/.*\.ts$/, artifact: 'schema', skill: 'schema' },
	{ match: new RegExp(`enums/.*${BACKEND_EXT}$`), artifact: 'enum', skill: 'enum' },

	// Frontend — TSX only (web + mobile share the .tsx surface)
	{ match: /\/-forms\/.*\.tsx?$/, artifact: 'form', skill: 'form' },
	{ match: /(-stores|stores)\/.*\.ts$/, artifact: 'store', skill: 'store' },
	{ match: /components\/ui\/.*\.tsx$/, artifact: 'primitive', skill: 'primitive' },
	{ match: /(-components|components)\/.*\.tsx$/, artifact: 'component', skill: 'component' },
	{ match: /routes\/.*\.tsx$/, artifact: 'route', skill: 'route' },
]

// ─── Skill ↔ language dispatch ───────────────────────────────────────
//
// detectLang lives in scripts/lib/repo-model.ts, derived from REPO.workspaces (the language of a
// file is the language of the WORKSPACE that contains it — CLAUDE.md §5). Which skills have a
// per-lang playbook is decided by the FILESYSTEM (existsSync on <skill>/<lang>/registry.yaml in
// resolveRegistryPath), not by a duplicated list here.

const LAYER_ORDER: Record<string, number> = {
	errors: 0,
	enum: 0,
	'value-object': 1,
	entity: 2,
	'db-schema': 3,
	repository: 4,
	service: 5,
	usecase: 5,
	handler: 5,
	job: 5,
	event: 5,
	controller: 6,
	schema: 6,
	query: 6,
	primitive: 7,
	route: 8,
	section: 9,
	form: 9,
	store: 9,
	component: 10,
}

const LAYER_NAMES: Record<number, string> = {
	0: 'Foundations (Errors + Enums)',
	1: 'Value Objects',
	2: 'Entities',
	3: 'Database Schema',
	4: 'Repositories',
	5: 'Application (Use Cases, Services, Handlers)',
	6: 'Interface (Controllers, Schemas, Queries)',
	7: 'Primitives',
	8: 'Frontend Routes',
	9: 'Sections, Forms & Stores',
	10: 'Components',
}

export function classifyFile(
	file: string,
	contextFilter: string,
	scope: Options['scope'],
	onUnclassified?: (file: string) => void,
): ClassifiedFile | null {
	const name = basename(file)

	// Backend (.ts/.tsx/.go) or frontend (.tsx)
	if (!/\.(?:tsx?|go)$/.test(name)) return null

	// Skip tests, generated, stories, index
	if (/\.(gen|test|spec)\.(ts|tsx)$/.test(name)) return null // ts test files
	if (/_test\.go$/.test(name)) return null // go colocated tests
	if (name.endsWith('.stories.tsx')) return null
	if (name === 'index.ts') return null

	// Skip non-project files
	if (/\/(node_modules|dist|sdk|\.claude|target)\//.test(file)) return null

	// Context filter — scope-aware. Path layouts (roots from template.config.ts):
	//   backend ts:  <workspaceRoots.apiTs>/<ctx>/...
	//   backend go:  <workspaceRoots.apiGo>/<ctx>/...
	//   frontend:    packages/app/{react,expo}/src/routes/<ctx>/...
	//                <workspaceRoots.appAstro>/pages/<ctx>/...
	if (contextFilter) {
		if (scope === 'frontend') {
			const ok =
				new RegExp(`packages/app/(?:react|expo)/(?:src/)?(?:routes|app)/${contextFilter}/`).test(file) ||
				new RegExp(`${REPO.workspaceRoots.appAstro}/pages/${contextFilter}/`).test(file)
			if (!ok) return null
		} else if (scope === 'backend') {
			const ok = file.includes(`${BACKEND_TS_ROOT}/${contextFilter}/`) || file.includes(`${REPO.workspaceRoots.apiGo}/${contextFilter}/`)
			if (!ok) return null
		} else {
			if (!file.includes(`/${contextFilter}/`)) return null
		}
	}

	for (const rule of CLASSIFICATION_RULES) {
		if (rule.match.test(file)) {
			return { artifact: rule.artifact, skill: rule.skill, lang: detectLang(file), file }
		}
	}

	// Reached the end with no rule match: a real candidate file (it cleared every
	// intentional-skip guard above and the scope/context filters) that NO
	// CLASSIFICATION_RULES entry claimed. Surfacing it is the ROOT fix for the
	// silent-drop bug — jobs/ was one such family that vanished from review with
	// zero warning (its rule above is the symptom fix). The caller lists these so
	// a genuine miss gets a rule added instead of being dropped in silence.
	onUnclassified?.(file)
	return null
}

// ─── Registry compilation + scope filtering ──────────────────────────

const FRONTEND_ARTIFACTS = new Set(['route', 'component', 'section', 'form', 'store', 'primitive'])
const BASE_PROMPT_TOKEN_OVERHEAD = 500
const FIELD_SUMMARY_LIMIT = 180

// ── Per-file token cost (single-pass, no tools) ──
const SCHEMA_FIXED_OVERHEAD = 200 // JSON schema wrapper for reasoning + failures arrays
const OUTPUT_PER_VERDICT = 15 // {"id":"XX-00","v":"P"} — ~15 tokens each
const OUTPUT_PER_FAILURE = 120 // 5 fields (id, severity, lines, problem, fix) × ~24 tokens
const ESTIMATED_FAILURE_RATE = 0.15 // ~15% of checklist items fail on average

// Additional skill registries to always include when reviewing certain artifact types.
// Components and routes can contain forms, so form patterns must always be in scope.
const ARTIFACT_CONTEXT_READS: Record<string, string[]> = {
	component: ['form'],
	route: ['form'],
}

const projectFileCache = new Map<string, string>()
const compiledChecklistCache = new Map<string, CompiledChecklist>()
const readPlanCache = new Map<string, ReviewReadPlan>()

// cc-bp review scopes come from each entry's `scope:` field in .claude/registry.yaml — the yaml
// is the ONE taxonomy source (the old CC_BP_SCOPE mirror here drifted per new entry by design).
function getRelevantCCBPs(artifact: string): string[] {
	const scope = FRONTEND_ARTIFACTS.has(artifact) ? 'frontend' : 'backend'
	return Object.entries(globalRegistry().ccBpScopes)
		.filter(([, s]) => s === 'all' || s === scope)
		.map(([id]) => id)
}

function readProjectFile(relativePath: string): string {
	if (projectFileCache.has(relativePath)) return projectFileCache.get(relativePath)!

	const fullPath = resolve(PROJECT_ROOT, relativePath)
	const content = existsSync(fullPath) ? readFileSync(fullPath, 'utf-8') : ''
	projectFileCache.set(relativePath, content)
	return content
}

function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4)
}

function leadingSpaces(line: string): number {
	return line.match(/^ */)?.[0].length ?? 0
}

function stripQuotes(value: string): string {
	const trimmed = value.trim()
	if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
		return trimmed.slice(1, -1)
	}
	return trimmed
}

function normalizeSummaryText(value: string, limit = FIELD_SUMMARY_LIMIT): string {
	const compact = value
		.replace(/```[a-z]*\n?/gi, ' ')
		.replace(/\s+/g, ' ')
		.trim()

	if (compact.length <= limit) return compact
	return `${compact.slice(0, limit - 1).trimEnd()}…`
}

function parseChecklistSection(content: string, sectionName: string, kind: ChecklistEntry['kind']): ChecklistEntry[] {
	const lines = content.split('\n')
	const sectionIndex = lines.findIndex(line => {
		const match = line.match(/^(\s*)([\w_]+):\s*$/)
		return match?.[2] === sectionName
	})

	if (sectionIndex === -1) return []

	const sectionIndent = leadingSpaces(lines[sectionIndex])
	const itemIndent = sectionIndent + 2
	const keyIndent = itemIndent + 2
	const blockIndent = keyIndent + 2

	const entries: Record<string, string>[] = []
	let current: Record<string, string> | null = null
	let blockKey: string | null = null

	const pushCurrent = () => {
		if (!current?.id) return

		entries.push(current)
		current = null
	}

	for (let i = sectionIndex + 1; i < lines.length; i++) {
		const line = lines[i]
		const indent = leadingSpaces(line)

		if (blockKey && current) {
			if (line.trim() === '') {
				current[blockKey] += '\n'
				continue
			}

			if (indent >= blockIndent) {
				const blockValue = line.slice(Math.min(blockIndent, line.length))
				current[blockKey] += `${current[blockKey] ? '\n' : ''}${blockValue}`
				continue
			}

			blockKey = null
		}

		if (line.trim() === '') continue

		if (indent <= sectionIndent && /^[\w_]+:\s*/.test(line.trim())) {
			pushCurrent()
			break
		}

		const itemMatch = line.match(new RegExp(`^\\s{${itemIndent}}-\\s+id:\\s*(.+)$`))
		if (itemMatch) {
			pushCurrent()
			current = { id: stripQuotes(itemMatch[1]) }
			continue
		}

		if (!current) continue

		const keyMatch = line.match(new RegExp(`^\\s{${keyIndent}}([\\w_]+):\\s*(.*)$`))
		if (!keyMatch) continue

		const [, key, rawValue] = keyMatch
		const value = rawValue.trim()
		if (value === '|' || value === '>') {
			current[key] = ''
			blockKey = key
			continue
		}

		current[key] = stripQuotes(value)
	}

	pushCurrent()

	return entries.map(entry => ({
		id: entry.id ?? '',
		kind,
		name: entry.name ?? '',
		when: entry.when,
		appliesTo: entry.applies_to,
		severity: entry.severity,
		rule: entry.rule,
		wrong: entry.wrong,
		right: entry.right,
		alwaysFlagWhen: entry.always_flag_when,
		note: entry.note,
	}))
}

function renderCompactChecklistSection(title: string, entries: ChecklistEntry[]): string {
	if (entries.length === 0) return `${title}: none`

	const lines = entries.map(entry => {
		const parts = [`${entry.id} ${entry.name}`]
		if (entry.when) parts.push(`when=${normalizeSummaryText(entry.when, 80)}`)
		if (entry.appliesTo) parts.push(`applies_to=${normalizeSummaryText(entry.appliesTo, 80)}`)
		if (entry.severity) parts.push(`severity=${entry.severity}`)
		if (entry.alwaysFlagWhen) parts.push(`always_flag_when=${normalizeSummaryText(entry.alwaysFlagWhen)}`)
		if (entry.rule) parts.push(`must=${normalizeSummaryText(entry.rule)}`)
		if (entry.wrong) parts.push(`avoid=${normalizeSummaryText(entry.wrong)}`)
		if (entry.right) parts.push(`correct=${normalizeSummaryText(entry.right)}`)
		if (entry.note) parts.push(`note=${normalizeSummaryText(entry.note)}`)
		return `- ${parts.join(' | ')}`
	})

	return `${title} (${entries.length})\n${lines.join('\n')}`
}

/**
 * Resolve the registry path for a skill: the FILESYSTEM decides whether a skill has a per-lang
 * playbook — `<skill>/<lang>/registry.yaml` when it exists, else the flat root. No duplicated
 * variant-skill lists (they drifted between review.ts and the classify-edit hook by design).
 */
function resolveRegistryPath(skill: string, lang: SkillLang): string {
	const variantPath = `.claude/skills/${skill}/${lang}/registry.yaml`
	if (existsSync(resolve(PROJECT_ROOT, variantPath))) return variantPath
	return `.claude/skills/${skill}/registry.yaml`
}

function getCompiledChecklist(skill: string, lang: SkillLang, artifact: string): CompiledChecklist {
	const cacheKey = `${skill}::${lang}::${artifact}`
	if (compiledChecklistCache.has(cacheKey)) return compiledChecklistCache.get(cacheKey)!

	const skillContent = readProjectFile(resolveRegistryPath(skill, lang))
	const sharedRegistry = readProjectFile('.claude/registry.yaml')

	let patterns = parseChecklistSection(skillContent, 'patterns', 'pattern')
	let badPractices = parseChecklistSection(skillContent, 'bad_practices', 'bad_practice')

	// Merge context_reads registries (e.g. form patterns always loaded for component/route).
	// Context-read skills use the SAME lang as the host file.
	for (const contextSkill of ARTIFACT_CONTEXT_READS[artifact] ?? []) {
		const contextContent = readProjectFile(resolveRegistryPath(contextSkill, lang))
		patterns = [...patterns, ...parseChecklistSection(contextContent, 'patterns', 'pattern')]
		badPractices = [...badPractices, ...parseChecklistSection(contextContent, 'bad_practices', 'bad_practice')]
	}

	const crossCutting = parseChecklistSection(sharedRegistry, 'cross_cutting_bad_practices', 'cross_cutting').filter(entry =>
		getRelevantCCBPs(artifact).includes(entry.id),
	)

	const all = [...patterns, ...badPractices, ...crossCutting]
	const compactText = [
		renderCompactChecklistSection('Patterns', patterns),
		renderCompactChecklistSection('Bad practices', badPractices),
		renderCompactChecklistSection('Cross-cutting', crossCutting),
	].join('\n\n')

	const compiled = {
		skill,
		lang,
		artifact,
		patterns,
		badPractices,
		crossCutting,
		all,
		compactText,
	}

	compiledChecklistCache.set(cacheKey, compiled)
	return compiled
}

function getAncestorIndexes(file: string, stopDir: string): string[] {
	const results: string[] = []
	let current = dirname(file)

	while (current.startsWith(stopDir)) {
		const indexFile = `${current}/index.ts`
		if (indexFile !== file && existsSync(resolve(PROJECT_ROOT, indexFile))) {
			results.push(indexFile)
		}

		if (current === stopDir) break
		const parent = dirname(current)
		if (parent === current) break
		current = parent
	}

	return results
}

// ─── Import-based dependency resolution ──────────────────────────────

/** Framework imports that don't carry domain context for review */
const SKIP_IMPORT_PREFIXES = ['@shared/types/', '@shared/utils/', '@shared/entities', '@shared/errors', '@shared/index']

/**
 * Resolves a barrel re-export to the concrete source file.
 * Handles flat barrels (entities/index.ts) and nested barrels (repositories/X/index.ts).
 */
function resolveBarrelExport(barrelDir: string, exportFrom: string): string | null {
	const name = exportFrom.replace(/^\.\//, '')
	const candidates = [`${barrelDir}/${name}.ts`, `${barrelDir}/${name}/index.ts`, `${barrelDir}/${name}/${name}.ts`]

	for (const candidate of candidates) {
		if (existsSync(resolve(PROJECT_ROOT, candidate))) {
			if (candidate.endsWith('/index.ts')) {
				const nested = readProjectFile(candidate)
				const first = nested.match(/export\s+{[^}]+}\s+from\s+['"]\.\/([^'"]+)['"]/)
				if (first) {
					const nestedFile = `${barrelDir}/${name}/${first[1]}.ts`
					if (existsSync(resolve(PROJECT_ROOT, nestedFile))) return nestedFile
				}
			}
			return candidate
		}
	}
	return null
}

/**
 * Parses a source file's imports and resolves each named import through
 * barrel index files to find concrete dependency file paths.
 * Only resolves same-context domain imports — skips @shared framework imports.
 */
function resolveImportedDependencies(file: string): string[] {
	const content = readProjectFile(file)
	if (!content) return []

	const resolved = new Set<string>()
	const importRegex = /import\s+(?:type\s+)?{([^}]+)}\s+from\s+['"]@([^/]+)\/([^'"]+)['"]/g

	for (const match of content.matchAll(importRegex)) {
		const rawNames = match[1]
		const context = match[2]
		const folder = match[3]
		const importPath = `@${context}/${folder}`

		if (SKIP_IMPORT_PREFIXES.some(prefix => importPath.startsWith(prefix))) continue

		const names = rawNames
			.split(',')
			.map(n =>
				n
					.trim()
					.replace(/^type\s+/, '')
					.replace(/\s+as\s+\w+/, ''),
			)
			.filter(n => n.length > 0)

		const barrelIndex = `${BACKEND_TS_ROOT}/${context}/${folder}/index.ts`
		const directFile = `${BACKEND_TS_ROOT}/${context}/${folder}.ts`

		if (existsSync(resolve(PROJECT_ROOT, barrelIndex))) {
			const barrelContent = readProjectFile(barrelIndex)
			const barrelDir = `${BACKEND_TS_ROOT}/${context}/${folder}`

			for (const name of names) {
				// Check if it's a barrel re-export (export { X } from './Y')
				const exportRegex = new RegExp(`export\\s+{[^}]*\\b${name}\\b[^}]*}\\s+from\\s+['"](\\.[^'"]+)['"]`)
				const exportMatch = barrelContent.match(exportRegex)
				if (exportMatch) {
					const r = resolveBarrelExport(barrelDir, exportMatch[1])
					if (r) resolved.add(r)
				} else if (barrelContent.includes(`export type`) && barrelContent.includes(name)) {
					// Direct declaration barrel (like errors/index.ts) — include the barrel itself
					resolved.add(barrelIndex)
				}
			}
		} else if (existsSync(resolve(PROJECT_ROOT, directFile))) {
			resolved.add(directFile)
		}
	}

	resolved.delete(file)
	return [...resolved]
}

export function getReviewReadPlan(classified: ClassifiedFile): ReviewReadPlan {
	const cacheKey = `${classified.artifact}::${classified.file}`
	if (readPlanCache.has(cacheKey)) return readPlanCache.get(cacheKey)!

	const supportFiles = new Set<string>()

	if (classified.file.startsWith(`${BACKEND_TS_ROOT}/`)) {
		// GlobalErrorMapper excluded — ~4K tokens of error→HTTP status mapping
		// that adds no review value and gets duplicated across every controller batch

		if (classified.artifact === 'enum') {
			supportFiles.add(`${BACKEND_TS_ROOT}/shared/index.ts`)
		}

		// The file's OWN folder barrel — kills the "not re-exported from the barrel"
		// false-positive family (the reviewer can't verify an export it never sees).
		const ownBarrel = `${classified.file.slice(0, classified.file.lastIndexOf('/'))}/index.ts`
		if (ownBarrel !== classified.file && existsSync(resolve(PROJECT_ROOT, ownBarrel))) {
			supportFiles.add(ownBarrel)
		}

		// Resolve domain imports to concrete dependency files
		for (const dep of resolveImportedDependencies(classified.file)) {
			supportFiles.add(dep)
		}
	} else {
		// Frontend: walk the ancestor barrels within whichever app root owns the file.
		const appRoot = APP_SRC_ROOTS.find(root => classified.file.startsWith(`${root}/`))
		if (appRoot) {
			for (const indexFile of getAncestorIndexes(classified.file, appRoot)) {
				supportFiles.add(indexFile)
			}
		}
	}

	supportFiles.delete(classified.file)

	const supportFilesList = [...supportFiles]
	const fileTokens = estimateTokens(readProjectFile(classified.file))
	const supportTokens = supportFilesList.reduce((sum, file) => sum + estimateTokens(readProjectFile(file)), 0)
	const plan: ReviewReadPlan = {
		file: classified.file,
		supportFiles: supportFilesList,
		fileTokens,
		supportTokens,
	}

	readPlanCache.set(cacheKey, plan)
	return plan
}

/**
 * Estimates total token cost for a single-pass review of one file.
 * Source + deps are inlined in the prompt (no tool reads, no double file read).
 *
 * Input:  checklist (shared) + inlined source + inlined deps
 * Schema: fixed wrapper + failures array
 * Output: ~120 tokens per estimated failure (4 fields: severity, lines, problem, fix)
 */
function estimateFileReviewTokens(plan: ReviewReadPlan, checklistSize: number): number {
	const estFailures = Math.ceil(checklistSize * ESTIMATED_FAILURE_RATE)

	return (
		plan.fileTokens + plan.supportTokens + SCHEMA_FIXED_OVERHEAD + checklistSize * OUTPUT_PER_VERDICT + estFailures * OUTPUT_PER_FAILURE
	)
}

// ─── Single-pass prompt: inline source + deps, failures-only output ──

function buildInlinedSources(files: ClassifiedFile[]): string {
	return files
		.map(file => {
			const plan = getReviewReadPlan(file)
			const source = readProjectFile(file.file)
			const depSections = plan.supportFiles
				.map(dep => {
					const content = readProjectFile(dep)
					return `// ── dep: ${dep}\n${content}`
				})
				.join('\n\n')

			return `### ${file.file} (${file.artifact})
\`\`\`ts
${source}
\`\`\`${depSections ? `\n\n#### Dependencies\n\`\`\`ts\n${depSections}\n\`\`\`` : ''}`
		})
		.join('\n\n')
}

function buildSinglePassPrompt(checklist: CompiledChecklist, files: ClassifiedFile[]): string {
	return `You are a senior code reviewer for a DDD/Clean Architecture TypeScript monorepo.
All source code and dependencies are inlined below. Do NOT use any tools.

## Review process (MANDATORY — follow exactly)

For EACH file, evaluate EVERY checklist item and record a **binary** verdict in the \`reasoning\` array:
- **P** (Pass) — the code complies with this rule, OR the rule's \`when\` condition is inapplicable to this file
- **F** (Fail) — the code violates the rule

There is NO skip option. Every item gets P or F. If a rule's \`when\` condition does not apply (e.g. "when transactions are used" but the file has no transactions), that is a trivial **P** — the code cannot violate a rule that doesn't apply.

How to evaluate each item:
1. Read the item ID, name, rule, and \`wrong\` field (if any).
2. If the \`when\` condition is provably inapplicable, verdict is **P** (trivial compliance).
3. If it applies or might apply, search the source code for concrete evidence of compliance or violation.
4. For items with a \`wrong\` field or \`always_flag_when\` field, actively look for the anti-pattern in the source.
5. For conditional items (UC-C*, UC-P*, CTRL-C*, etc.), cross-reference with the inlined dependencies to determine if the condition is met.
6. **Absence = Fail**: When \`when=always\` and the \`must\` pattern is completely absent from the source (not just written differently — truly missing), that is an **F**, not a P. The \`avoid\` field lists known wrong alternatives, but absence of the required pattern is ALSO a failure even when no \`avoid\` anti-pattern is present. Do not confuse a partial match (e.g. an inline usage) with compliance — the \`must\` field describes the exact shape that must exist.

After recording ALL verdicts, populate the \`failures\` array with details for every item marked **F**.

## Output rules
- Return JSON only. No markdown. No prose.
- The \`reasoning\` array MUST contain one entry per checklist item per file, in order. Every ID must appear.
- The \`failures\` array contains details ONLY for items with verdict F.
- If a file has zero failures, include it with a full \`reasoning\` array and an empty \`failures\` array.

## Checklist
${checklist.compactText}

## Source files
${buildInlinedSources(files)}`
}

function buildSinglePassSchema(files: ClassifiedFile[]): Record<string, unknown> {
	return {
		type: 'object',
		required: ['reviews'],
		properties: {
			reviews: {
				type: 'array',
				minItems: files.length,
				maxItems: files.length,
				items: {
					type: 'object',
					required: ['file', 'artifact', 'reasoning', 'failures'],
					properties: {
						file: { type: 'string' },
						artifact: { type: 'string' },
						reasoning: {
							type: 'array',
							items: {
								type: 'object',
								required: ['id', 'v'],
								properties: {
									id: { type: 'string' },
									v: { type: 'string', enum: ['P', 'F'] },
								},
							},
						},
						failures: {
							type: 'array',
							items: {
								type: 'object',
								required: ['id', 'severity', 'lines', 'problem', 'fix'],
								properties: {
									id: { type: 'string' },
									severity: { type: 'string' },
									lines: { type: 'string' },
									problem: { type: 'string' },
									fix: { type: 'string' },
								},
							},
						},
					},
				},
			},
		},
	}
}

// ─── Graph-aware logic-bug pass (--with-graph) ───────────────────────
//
// Separate from the checklist pass above. The checklist pass answers
// "does this violate a documented rule" using only inlined source + static
// imports; it cannot confirm whether a violation (or a subtler bug outside
// the checklist) actually breaks anything downstream. This pass instead
// hands the model the real dependency graph's blast radius for each file
// (scripts/graph) and asks for logic bugs it can ground in that data —
// contract breaks, orphaned events, table read/write mismatches — with a
// hard rule against inventing cross-file relationships the graph doesn't
// show. Still zero tool calls: the graph payload is pre-computed text,
// inlined into the prompt exactly like the checklist's compact text is.

/**
 * Loads the graph query context, building .graph/graph.json first if it's
 * missing or --rebuild-graph was requested. Returns null (never throws) if
 * the build itself fails — callers should treat that as "skip the graph
 * pass for this run" rather than aborting the whole review.
 */
async function loadGraphContext(rebuild: boolean, log: (...args: unknown[]) => void): Promise<FastQueryContext | null> {
	try {
		if (rebuild) {
			log('  Rebuilding code graph (--rebuild-graph)...')
			const result = await buildGraph()
			writeGraphOutputs(result)
			log(`  Graph rebuilt: ${result.stats.nodes} nodes, ${result.stats.edges} edges.`)
			return loadQueryContext()
		}
		if (!existsSync(GRAPH_JSON)) {
			log('  Code graph not found, building once (pass --rebuild-graph to always refresh)...')
			const result = await buildGraph()
			writeGraphOutputs(result)
			log(`  Graph built: ${result.stats.nodes} nodes, ${result.stats.edges} edges.`)
			return loadQueryContext()
		}
		const ctx = loadQueryContext()
		const ageMin = Math.round((Date.now() - new Date(ctx.graph.generatedAt).getTime()) / 60000)
		log(`  Graph context loaded (built ${ageMin}m ago — pass --rebuild-graph if the codebase moved since).`)
		return ctx
	} catch (err) {
		log(`  Graph pass disabled: failed to load/build code graph (${err instanceof Error ? err.message : String(err)}).`)
		return null
	}
}

/** Renders the pre-computed graph context for just the files in one batch, reusing the shared registries map. */
function buildGraphContextText(files: ClassifiedFile[], graphBatch: ReviewBatchResult): string {
	const fileSet = new Set(files.map(f => f.file))
	const scoped: ReviewBatchResult = { ...graphBatch, files: graphBatch.files.filter(f => fileSet.has(f.file)) }
	return formatReviewBatch(scoped)
}

function buildGraphAwarePrompt(files: ClassifiedFile[], graphContextText: string): string {
	return `You are hunting for REAL logic bugs in a DDD/Clean Architecture TypeScript monorepo — not style, not documented bad-practice violations (a separate pass already checks those). All source code and dependencies are inlined below. Do NOT use any tools.

## What counts as a finding here

Report a finding ONLY if you can describe a concrete failure scenario: specific input or state that produces a wrong result, an exception, data corruption, or a broken contract. "This could theoretically cause issues" is not a finding. If a documented bad practice would apply, skip it — it belongs to the other pass, not this one.

## Graph context — ground truth, not a suggestion

Below the source is a pre-computed dependency-graph payload: for each changed file, its real upstream dependents and downstream blast radius (transitiveDownstream), and direct edges by kind (raises-event/handles-event, reads-table/writes-table, depends-on-repo, orchestrates, etc.). This was extracted from the actual codebase — it is ground truth, not an inference you're being asked to make.

**Hard rule**: if a finding claims a cross-file consequence (a caller breaks, an event goes unhandled, a table write is never read, a contract consumer expects a different shape), you MUST cite the specific node id(s) from the graph context that support that claim in the finding's \`citedNodes\` array. If the graph context does not show enough to support a cross-file claim, do not make it — report only what you can verify in the inlined source, or omit the finding. Never assert a caller, consumer, or downstream effect that isn't listed in the payload below.

Findings entirely within one file (no cross-file claim) are still valid — leave \`citedNodes\` empty for those.

## What to look for

- **Broken contracts**: a repository/service/schema shape changed in the diff but a resolved dependent (in \`incomingResolved\`/\`outgoingResolved\`/\`transitiveDownstream\`) still expects the old shape.
- **Orphaned events**: a \`raises-event\` edge with no matching \`handles-event\` anywhere in the payload, or a handler that assumes a payload shape the raiser doesn't produce.
- **Table read/write mismatches**: a \`writes-table\` with no corresponding \`reads-table\` anywhere in the graph (a write nothing ever consumes — often a sign the write target is wrong), or a \`reads-table\` assuming a field no \`writes-table\` in scope actually sets.
- **Cross-file state bugs**: a value computed correctly in isolation but wrong once you trace how an upstream or downstream node actually uses it — cite that node.

## Output rules
- Return JSON only. No markdown. No prose.
- One entry in \`reviews\` per file, in order, even if its \`findings\` array is empty.
- Do not pad the output with checklist-style findings — an empty \`findings\` array is a valid and expected result for a file with no real logic bug.

## Source files
${buildInlinedSources(files)}

## Graph Context
${graphContextText}`
}

function buildGraphAwareSchema(files: ClassifiedFile[]): Record<string, unknown> {
	return {
		type: 'object',
		required: ['reviews'],
		properties: {
			reviews: {
				type: 'array',
				minItems: files.length,
				maxItems: files.length,
				items: {
					type: 'object',
					required: ['file', 'findings'],
					properties: {
						file: { type: 'string' },
						findings: {
							type: 'array',
							items: {
								type: 'object',
								required: ['severity', 'lines', 'problem', 'fix', 'citedNodes'],
								properties: {
									severity: { type: 'string' },
									lines: { type: 'string' },
									problem: { type: 'string' },
									fix: { type: 'string' },
									citedNodes: { type: 'array', items: { type: 'string' } },
								},
							},
						},
					},
				},
			},
		},
	}
}

async function runGraphAwareBatch(files: ClassifiedFile[], graphContextText: string, model: string): Promise<Map<string, GraphFinding[]>> {
	const prompt = buildGraphAwarePrompt(files, graphContextText)
	const schema = buildGraphAwareSchema(files)
	const result = await runClaudeJson<GraphAwareBatchResult>(prompt, model, schema)

	const byFile = new Map<string, GraphFinding[]>()
	for (const file of files) {
		const review = result.reviews.find(r => r.file === file.file)
		byFile.set(file.file, review?.findings ?? [])
	}
	return byFile
}

function renderGraphFindings(findings: GraphFinding[]): string {
	if (findings.length === 0) return ''

	const lines = ['', '## Logic Bugs (graph-aware)', '']
	for (const f of findings) {
		lines.push(`### ${f.severity.toUpperCase()} — line(s) ${f.lines}`)
		lines.push('')
		lines.push(`**Problem**: ${f.problem}`)
		lines.push('')
		if (f.citedNodes.length > 0) {
			lines.push(`**Cross-file evidence**: ${f.citedNodes.join(', ')}`)
			lines.push('')
		}
		lines.push('**Fix**:')
		lines.push('```ts')
		lines.push(sanitizeCodeBlock(f.fix))
		lines.push('```')
		lines.push('')
	}
	return lines.join('\n')
}

// ─── Claude CLI runners ─────────────────────────────────────────────

/** Env that detaches from parent Claude Code session */
const DETACHED_ENV = {
	...process.env,
	CLAUDECODE: undefined,
	CLAUDE_CODE_SSE_PORT: undefined,
	CLAUDE_CODE_ENTRYPOINT: undefined,
}

/** Flags that strip Claude Code overhead (~28K tokens of system prompt, tools, agents, skills, memory) */
const LEAN_FLAGS = ['--no-session-persistence', '--disallowedTools', '*', '--setting-sources', '']

/**
 * Flags for the structured-output path. Structured output is delivered via an
 * internal `StructuredOutput` tool the model must call; a wildcard `--disallowedTools '*'`
 * (as in LEAN_FLAGS) denies it on every attempt → error_max_structured_output_retries.
 * Allow ONLY that tool — every other tool still falls through to deny in non-interactive
 * mode, preserving the "review from the prompt, no tool use" guarantee. (bypassPermissions
 * is not an option: it's blocked under root.)
 */
const JSON_FLAGS = ['--no-session-persistence', '--allowedTools', 'StructuredOutput', '--setting-sources', '']

async function runClaudeText(prompt: string, model: string): Promise<string> {
	const proc = Bun.spawn(['claude', '-p', prompt, '--model', model, ...LEAN_FLAGS], {
		cwd: PROJECT_ROOT,
		stdout: 'pipe',
		stderr: 'pipe',
		env: DETACHED_ENV,
	})

	const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
	const exitCode = await proc.exited
	if (exitCode !== 0) {
		throw new Error(stderr.trim() || stdout.trim() || `claude exited with status ${exitCode}`)
	}

	return stdout.trim()
}

function extractJsonText(raw: string): string {
	const trimmed = raw.trim()
	if (!trimmed) throw new Error('Claude returned empty output')

	const start = trimmed.search(/[[{]/)
	if (start === -1) return trimmed

	const candidate = trimmed.slice(start)
	const endChar = candidate.startsWith('[') ? ']' : '}'
	const end = candidate.lastIndexOf(endChar)
	return end === -1 ? candidate : candidate.slice(0, end + 1)
}

async function runClaudeJson<T>(prompt: string, model: string, schema: Record<string, unknown>): Promise<T> {
	const proc = Bun.spawn(
		['claude', '-p', prompt, '--model', model, '--output-format', 'json', '--json-schema', JSON.stringify(schema), ...JSON_FLAGS],
		{
			cwd: PROJECT_ROOT,
			stdout: 'pipe',
			stderr: 'pipe',
			env: DETACHED_ENV,
		},
	)

	const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
	const exitCode = await proc.exited

	if (exitCode !== 0) {
		throw new Error(stderr.trim() || stdout.trim() || `claude exited with status ${exitCode}`)
	}

	const parsed = JSON.parse(extractJsonText(stdout))

	// A structured-output failure (e.g. StructuredOutput denied 5×, or the model
	// never produced valid JSON) comes back as a result envelope with is_error /
	// subtype error_max_structured_output_retries — NOT as a reviews payload.
	// Throw a clear message (naming any denied tools) instead of letting the
	// caller hit a downstream `result.reviews.find` TypeError.
	if (parsed?.is_error || parsed?.subtype === 'error_max_structured_output_retries') {
		const denied = parsed.permission_denials?.map((d: { tool_name: string }) => d.tool_name).join(', ')
		throw new Error(`structured output failed: ${parsed.errors?.join('; ') ?? parsed.subtype}${denied ? ` (denied tools: ${denied})` : ''}`)
	}

	if (parsed?.structured_output != null) {
		return parsed.structured_output as T
	}

	return parsed as T
}

// ─── Concurrency limiter ────────────────────────────────────────────

function createSemaphore(limit: number) {
	let running = 0
	const queue: Array<() => void> = []

	return async <T>(fn: () => Promise<T>): Promise<T> => {
		if (running >= limit) {
			await new Promise<void>(resolve => queue.push(resolve))
		}
		running++
		try {
			return await fn()
		} finally {
			running--
			queue.shift()?.()
		}
	}
}

// ─── Batching ───────────────────────────────────────────────────────

function buildReviewBatches(classified: ClassifiedFile[], batchTokenBudget: number): ReviewBatch[] {
	const groups = new Map<string, ClassifiedFile[]>()

	for (const file of classified) {
		// Batches are keyed by (skill, lang, artifact) so each batch loads one specific
		// language-variant checklist (e.g. entity-typescript never mixes with entity-go).
		const key = `${file.skill}::${file.lang}::${file.artifact}`
		if (!groups.has(key)) groups.set(key, [])
		groups.get(key)!.push(file)
	}

	const batches: ReviewBatch[] = []

	for (const [key, files] of groups) {
		const [skill, lang, artifact] = key.split('::') as [string, SkillLang, string]
		const checklist = getCompiledChecklist(skill, lang, artifact)
		const baseTokens = estimateTokens(checklist.compactText) + BASE_PROMPT_TOKEN_OVERHEAD
		const checklistSize = checklist.all.length

		let currentFiles: ClassifiedFile[] = []
		let currentTokens = baseTokens

		for (const file of files.sort((a, b) => a.file.localeCompare(b.file))) {
			const plan = getReviewReadPlan(file)
			const fileEstimate = estimateFileReviewTokens(plan, checklistSize)
			const nextTokens = currentFiles.length === 0 ? baseTokens + fileEstimate : currentTokens + fileEstimate

			if (currentFiles.length > 0 && nextTokens > batchTokenBudget) {
				batches.push({ skill, lang, artifact, files: currentFiles, estimatedTokens: currentTokens })
				currentFiles = [file]
				currentTokens = baseTokens + fileEstimate
				continue
			}

			currentFiles.push(file)
			currentTokens = nextTokens
		}

		if (currentFiles.length > 0) {
			batches.push({ skill, lang, artifact, files: currentFiles, estimatedTokens: currentTokens })
		}
	}

	return batches
}

// ─── Single-pass batch runner ───────────────────────────────────────

async function runReviewBatch(batch: ReviewBatch, checklist: CompiledChecklist, model: string): Promise<Map<string, SinglePassFileResult>> {
	const prompt = buildSinglePassPrompt(checklist, batch.files)
	const schema = buildSinglePassSchema(batch.files)

	// Resilient: a single transient/malformed Claude response must not abort the
	// whole run — but it must NOT fabricate results either. A file with no review
	// from the model is simply absent from the map; the caller records it as
	// unreviewed and the run exits non-zero. (A 429/limit error once produced 510
	// fake-clean "No violations found" reports via an empty-result fallback.)
	let reviews: SinglePassBatchResult['reviews'] | undefined
	try {
		const result = await runClaudeJson<SinglePassBatchResult>(prompt, model, schema)
		reviews = result?.reviews
	} catch (err) {
		console.warn(`  ⚠️  review batch failed (${batch.files.length} file(s) will be marked unreviewed): ${(err as Error).message}`)
	}
	if (!Array.isArray(reviews)) {
		if (reviews !== undefined) console.warn(`  ⚠️  review batch returned no reviews — ${batch.files.length} file(s) marked unreviewed`)
		reviews = []
	}

	const resultsByFile = new Map<string, SinglePassFileResult>()
	for (const file of batch.files) {
		const review = reviews.find(r => r.file === file.file)
		// No fabrication: only files the model actually returned get an entry.
		if (review) resultsByFile.set(file.file, review)
	}

	return resultsByFile
}

// ─── Report rendering ───────────────────────────────────────────────

function sanitizeCodeBlock(text: string): string {
	const trimmed = text.trim()
	if (!trimmed) return '// unavailable'
	return trimmed.replace(/```/g, '``\\`')
}

function renderReviewReport(file: ClassifiedFile, checklist: CompiledChecklist, review: SinglePassFileResult): string {
	const passes = review.reasoning.filter(r => r.v === 'P').length
	const fails = review.reasoning.filter(r => r.v === 'F').length

	const lines = [
		`# Review: \`${file.file}\``,
		'',
		`**Artifact**: ${file.artifact} | **Skill**: ${file.skill} | **Checked**: ${checklist.all.length} items | **P**: ${passes} | **F**: ${fails}`,
		'',
	]

	// Summary line — compact verdict per ID
	if (review.reasoning.length > 0) {
		lines.push('## Summary')
		lines.push('')
		lines.push(review.reasoning.map(r => `\`${r.id}\`:${r.v}`).join(' '))
		lines.push('')
	}

	lines.push('## Violations')
	lines.push('')

	if (review.failures.length === 0) {
		lines.push('_No violations found._')
	} else {
		for (const v of review.failures) {
			const entry = checklist.all.find(e => e.id === v.id)
			lines.push(`### [${v.id}] ${entry?.name || v.id}`)
			lines.push(`**Severity**: ${v.severity} | **Line(s)**: ${v.lines}`)
			lines.push('')
			lines.push(`**Problem**: ${v.problem}`)
			lines.push('')
			lines.push('**Fix**:')
			lines.push('```ts')
			lines.push(sanitizeCodeBlock(v.fix))
			lines.push('```')
			lines.push('')
		}
	}

	return lines.join('\n')
}

// ─── Cascade Impact Analysis ─────────────────────────────────────────

function parseReviewViolations(content: string): FileReview | null {
	const headerMatch = content.match(/# Review: `(.+?)`/)
	const artifactMatch = content.match(/\*\*Artifact\*\*: ([\w-]+)/)
	if (!headerMatch || !artifactMatch) return null

	const file = headerMatch[1]
	const artifact = artifactMatch[1]
	const layer = LAYER_ORDER[artifact] ?? 99

	if (content.includes('_No violations found._') || content.includes('No violations.') || content.match(/\*\*F\*\*: 0/)) {
		return { file, artifact, layer, violations: [] }
	}

	const violations: Violation[] = []
	const parts = content.split(/### \[/)
	for (let i = 1; i < parts.length; i++) {
		const part = parts[i]
		const idMatch = part.match(/^(\S+)\] (.+)/)
		const severityMatch = part.match(/\*\*Severity\*\*: (\w+)/)
		const linesMatch = part.match(/\*\*Line\(s\)\*\*: (.+)/)
		const problemMatch = part.match(/\*\*Problem\*\*: ([\s\S]+?)(?=\n\n\*\*Fix|\n\n---|\n\n##)/)
		const fixMatch = part.match(/```ts\n([\s\S]+?)```/)

		if (idMatch && severityMatch) {
			violations.push({
				id: idMatch[1],
				severity: severityMatch[1],
				lines: linesMatch ? linesMatch[1].trim() : '',
				problem: problemMatch ? problemMatch[1].trim() : '',
				fix: fixMatch ? fixMatch[1].trim() : '',
			})
		}
	}

	return { file, artifact, layer, violations }
}

function sourcePathToImportAliases(filePath: string): string[] {
	const apiMatch = filePath.match(/^packages\/api\/typescript\/src\/(\w+)\/(.+)\.ts$/)
	if (apiMatch) {
		const [, context, rest] = apiMatch
		const dir = dirname(rest)
		const patterns = [`'@${context}/${rest}'`]
		if (dir !== '.') patterns.push(`'@${context}/${dir}'`)
		return patterns
	}

	// Frontend targets differ in both alias and whether they nest under src/:
	//   react → '@/*' = ./src/*   ·   astro → '~/*' = ./src/*   ·   expo → '@/*' = ./*
	const reactMatch = filePath.match(/^packages\/app\/react\/src\/(.+)\.tsx?$/)
	if (reactMatch) return [`'@/${reactMatch[1]}'`]

	const astroMatch = filePath.match(/^packages\/app\/astro\/src\/(.+)\.tsx?$/)
	if (astroMatch) return [`'~/${astroMatch[1]}'`]

	const expoMatch = filePath.match(/^packages\/app\/expo\/(.+)\.tsx?$/)
	if (expoMatch) return [`'@/${expoMatch[1]}'`]

	return []
}

async function buildReverseImportGraph(files: string[]): Promise<Map<string, string[]>> {
	const graph = new Map<string, string[]>()

	for (const file of files) {
		const aliases = sourcePathToImportAliases(file)
		if (aliases.length === 0) continue

		const importers = new Set<string>()
		for (const alias of aliases) {
			const result = await exec([
				'rg',
				'-F',
				'--files-with-matches',
				'--glob',
				'*.ts',
				'--glob',
				'*.tsx',
				alias,
				BACKEND_TS_ROOT,
				'packages/app',
			])
			for (const f of result.split('\n').filter(Boolean)) {
				if (f !== file && !f.endsWith('index.ts')) importers.add(f)
			}
		}

		if (importers.size > 0) {
			graph.set(file, [...importers])
		}
	}

	return graph
}

function buildCascadePrompt(reviews: FileReview[], importGraph: Map<string, string[]>, classified: ClassifiedFile[]): string {
	const withViolations = reviews.filter(r => r.violations.length > 0)
	const byLayer = new Map<number, FileReview[]>()
	for (const r of withViolations) {
		const list = byLayer.get(r.layer) || []
		list.push(r)
		byLayer.set(r.layer, list)
	}

	let violationData = ''
	const sortedLayers = [...byLayer.keys()].sort((a, b) => a - b)
	for (const layer of sortedLayers) {
		const layerName = LAYER_NAMES[layer] || `Layer ${layer}`
		violationData += `\n### Layer ${layer}: ${layerName}\n`
		for (const r of byLayer.get(layer)!) {
			violationData += `\n**${r.file}** (${r.artifact})\n`
			for (const v of r.violations) {
				violationData += `- [${v.id}] ${v.severity} (L${v.lines}): ${v.problem}\n`
			}
			const dependents = importGraph.get(r.file)
			if (dependents) {
				violationData += `\n  Imported by:\n`
				for (const dep of dependents) {
					const depReview = reviews.find(rev => rev.file === dep)
					const depClass = classified.find(c => c.file === dep)
					const depArtifact = depClass?.artifact || 'unknown'
					const depLayer = LAYER_ORDER[depArtifact] ?? 99
					const depViolationCount = depReview?.violations.length ?? -1
					const status = depViolationCount === -1 ? '(not reviewed)' : depViolationCount === 0 ? 'clean' : `${depViolationCount} violations`
					violationData += `  - ${dep} (${depArtifact}, layer ${depLayer}) — ${status}\n`
				}
			}
		}
	}

	let graphData = ''
	for (const [file, deps] of importGraph) {
		graphData += `${file}:\n`
		for (const dep of deps) {
			const c = classified.find(cl => cl.file === dep)
			graphData += `  -> ${dep} (${c?.artifact || '?'})\n`
		}
	}

	return `You are analyzing the cascade impact of code violations in a DDD/Clean Architecture TypeScript monorepo.

## Architecture Layer Hierarchy

Issues in lower layers cascade upward through imports:

Layer 0: Foundations (Errors + Enums)
Layer 1: Value Objects
Layer 2: Entities
Layer 3: Database Schema
Layer 4: Repositories
Layer 5: Application (Use Cases, Services, Handlers)
Layer 6: Interface (Controllers, Schemas, Queries)
Layer 7: Primitives
Layer 8: Frontend Routes
Layer 9: Sections, Forms & Stores
Layer 10: Components

## All Violations (grouped by layer, lowest first)
${violationData}

## Import Graph (violated file -> imported by)
${graphData}

## Your Task

Produce a **Cascade Impact Analysis** report in markdown with these sections:

### 1. Root Causes (Bottom-Up)
For each layer (starting from lowest), list violations that are **root causes** — issues that originate here and propagate upward. Focus on violations where the file is imported by higher-layer files that also have violations.

### 2. Cascade Chains
Identify chains where a violation in a lower layer causes or worsens violations in higher layers.
Format each chain as: \`File A [violation-id] -> File B [violation-id] -> File C [violation-id]\`
Explain the causal relationship in one sentence.

### 3. Recommended Fix Order
Propose a numbered fix order, starting from the lowest layer. For each fix:
- State the file and violation ID
- Explain what to fix in one sentence
- List downstream files that will benefit (may auto-resolve or need updating)

### 4. Independent Issues
List violations that do NOT cascade (isolated to their own file). These can be fixed in any order.

## Output Rules
- Be concise — one sentence per explanation.
- Only report cascades where there's a real causal relationship (shared types, imported schemas, used enums, etc.).
- Don't invent cascades that don't exist in the import graph.
- If there are no cascades, say so explicitly.
- Format as clean markdown with no preamble.`
}

async function runCascadeAnalysis(classified: ClassifiedFile[], outputDir: string, model: string): Promise<string> {
	console.log()
	console.log('═══════════════════════════════════════════════════════════')
	console.log('  Phase 2: Cascade Impact Analysis')
	console.log('═══════════════════════════════════════════════════════════')
	console.log()

	// 1. Parse all review files
	const reviews: FileReview[] = []
	for (const c of classified) {
		const safeName = c.file.replace(/\//g, '_')
		const filePath = resolve(outputDir, `${safeName}.md`)
		if (existsSync(filePath)) {
			const content = readFileSync(filePath, 'utf-8')
			const review = parseReviewViolations(content)
			if (review) reviews.push(review)
		}
	}

	const withViolations = reviews.filter(r => r.violations.length > 0)
	const totalViolations = withViolations.reduce((sum, r) => sum + r.violations.length, 0)
	console.log(`  Parsed ${reviews.length} reviews, ${withViolations.length} with violations (${totalViolations} total)`)

	if (withViolations.length === 0) {
		console.log('  No violations found — skipping cascade analysis.')
		return ''
	}

	const violatedLayers = new Set(withViolations.map(review => review.layer))
	if (withViolations.length < 2 || violatedLayers.size < 2) {
		console.log('  Violations do not span multiple files/layers — skipping cascade analysis.')
		const report =
			'# Cascade Impact Analysis\n\nNo meaningful cascade detected. Violations are confined to a single file or architecture layer, so a second-pass cascade review would not add signal.\n'
		writeFileSync(resolve(outputDir, '_cascade-analysis.md'), report)
		console.log(`  Saved to: ${outputDir}/_cascade-analysis.md`)
		return report
	}

	// 2. Build reverse import graph for files with violations
	console.log('  Building import dependency graph...')
	const violatedFiles = withViolations.map(r => r.file)
	const importGraph = await buildReverseImportGraph(violatedFiles)
	console.log(`  Found ${importGraph.size} files with downstream dependents`)

	if (importGraph.size === 0) {
		console.log('  No cross-file dependencies detected — all violations are isolated.')
		const report =
			'# Cascade Impact Analysis\n\nNo cascade relationships detected. All violations are isolated to their own files and can be fixed independently in any order.\n'
		writeFileSync(resolve(outputDir, '_cascade-analysis.md'), report)
		console.log(`  Saved to: ${outputDir}/_cascade-analysis.md`)
		return report
	}

	// 3. Send to Claude for analysis
	console.log('  Analyzing cascade impact...')
	const prompt = buildCascadePrompt(reviews, importGraph, classified)
	const result = await runClaudeText(prompt, model)

	// 4. Save result
	writeFileSync(resolve(outputDir, '_cascade-analysis.md'), result)
	console.log(`  Saved to: ${outputDir}/_cascade-analysis.md`)

	return result
}

// ─── Multi-branch orchestration ──────────────────────────────────

async function runMultiBranch(opts: Options): Promise<void> {
	const log = opts.print ? (...args: unknown[]) => console.error(...args) : console.log.bind(console)

	log('╔═══════════════════════════════════════════════════════════╗')
	log('║        Multi-Branch Review with Claude Code              ║')
	log('╚═══════════════════════════════════════════════════════════╝')
	log()
	log(`  Base:     ${opts.prBase}`)
	log(`  Branches: ${opts.branches.join(', ')}`)
	log(`  Model:    ${opts.model}`)
	log()

	const outputRoot = opts.outputDir || resolve(PROJECT_ROOT, '.review-branches')
	mkdirSync(outputRoot, { recursive: true })

	const worktreeBase = resolve(PROJECT_ROOT, '.worktrees-review')
	mkdirSync(worktreeBase, { recursive: true })

	const scriptPath = resolve(PROJECT_ROOT, 'scripts/review.ts')

	// Register SIGINT handler to clean up worktrees on Ctrl+C
	const cleanupWorktrees = () => {
		console.error('\n  Caught SIGINT — cleaning up worktrees...')
		for (const entry of existsSync(worktreeBase) ? readdirSync(worktreeBase) : []) {
			const wt = resolve(worktreeBase, entry)
			try {
				Bun.spawnSync(['git', 'worktree', 'remove', '--force', wt], { cwd: PROJECT_ROOT })
				console.error(`  Removed ${wt}`)
			} catch {}
		}
		try {
			const remaining = readdirSync(worktreeBase)
			if (remaining.length === 0) rmSync(worktreeBase, { recursive: true, force: true })
		} catch {}
		process.exit(130)
	}
	process.on('SIGINT', cleanupWorktrees)

	// Phase 1: Create all worktrees sequentially (git worktree add is not parallel-safe)
	const prepared: Array<{ branch: string; safeBranch: string; worktreePath: string; branchOutputDir: string }> = []
	const failed: Array<{ branch: string; branchOutputDir: string }> = []

	for (const branch of opts.branches) {
		const safeBranch = branch.replace(/\//g, '_')
		const worktreePath = resolve(worktreeBase, safeBranch)
		const branchOutputDir = resolve(outputRoot, safeBranch)

		// Clean up stale worktree if exists
		if (existsSync(worktreePath)) {
			await exec(['git', 'worktree', 'remove', '--force', worktreePath])
		}

		log(`  Creating worktree for ${branch}...`)
		await exec(['git', 'worktree', 'add', worktreePath, branch])
		if (!existsSync(worktreePath)) {
			log(`  ✗ Failed to create worktree for ${branch}, skipping.`)
			failed.push({ branch, branchOutputDir })
			continue
		}

		prepared.push({ branch, safeBranch, worktreePath, branchOutputDir })
	}

	log(`  ${prepared.length} worktree(s) ready, ${failed.length} failed.`)
	log()

	// Phase 2: Run all reviews in parallel
	const results = await Promise.all(
		prepared.map(async ({ branch, worktreePath, branchOutputDir }) => {
			const childArgs = ['bun', scriptPath, '--pr', '--base', opts.prBase, '--output', branchOutputDir]
			if (opts.scope !== 'all') childArgs.push(`--${opts.scope}`)
			if (opts.contextFilter) childArgs.push('--context', opts.contextFilter)
			if (opts.model !== 'claude-sonnet-5') childArgs.push('--model', opts.model)
			if (!opts.batchMode) childArgs.push('--no-batch')
			if (opts.noCascade) childArgs.push('--no-cascade')
			if (opts.withGraph) childArgs.push('--with-graph')
			if (opts.rebuildGraph) childArgs.push('--rebuild-graph')
			if (opts.graphDepth !== 3) childArgs.push('--graph-depth', String(opts.graphDepth))
			if (opts.graphMaxDownstream !== 50) childArgs.push('--graph-max-downstream', String(opts.graphMaxDownstream))
			childArgs.push('--parallel', String(opts.parallel))
			if (opts.batchTokenBudget !== 20000) childArgs.push('--batch-token-budget', String(opts.batchTokenBudget))
			if (opts.dryRun) childArgs.push('--dry-run')

			const logFile = resolve(branchOutputDir, '_review.log')
			mkdirSync(branchOutputDir, { recursive: true })

			log(`  ▶ ${branch} — started`)

			const proc = Bun.spawn(childArgs, {
				cwd: worktreePath,
				stdout: Bun.file(logFile),
				stderr: Bun.file(logFile),
				env: { ...process.env, REVIEW_PROJECT_ROOT: worktreePath },
			})
			const exitCode = await proc.exited
			const success = exitCode === 0

			const reportCount = existsSync(branchOutputDir)
				? readdirSync(branchOutputDir).filter(f => f.endsWith('.md') && f !== '_review.log').length
				: 0

			log(`  ${success ? '✓' : '✗'} ${branch} — ${success ? `done (${reportCount} reports)` : `exit code ${exitCode}`}`)

			return { branch, success, outputDir: branchOutputDir, logFile }
		}),
	)

	// Phase 3: Cleanup all worktrees
	process.removeListener('SIGINT', cleanupWorktrees)
	for (const { worktreePath } of prepared) {
		await exec(['git', 'worktree', 'remove', '--force', worktreePath])
	}
	try {
		const remaining = readdirSync(worktreeBase)
		if (remaining.length === 0) rmSync(worktreeBase, { recursive: true, force: true })
	} catch {}

	// Summary
	log()
	log('═══════════════════════════════════════════════════════════')
	log('  Multi-Branch Review Summary')
	log('═══════════════════════════════════════════════════════════')
	for (const f of failed) {
		log(`  ✗ ${f.branch} — worktree creation failed`)
	}
	for (const r of results) {
		log(`  ${r.success ? '✓' : '✗'} ${r.branch} → ${r.outputDir}`)
		if (!r.success) log(`    Log: ${r.logFile}`)
	}
	log('═══════════════════════════════════════════════════════════')
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
	const opts = parseOptions()

	// Multi-branch mode: orchestrate independent reviews via worktrees
	if (opts.branches.length > 0) {
		return runMultiBranch(opts)
	}

	// In print mode all progress goes to stderr so stdout is pure review content
	const log = opts.print ? (...args: unknown[]) => console.error(...args) : console.log.bind(console)

	log('╔═══════════════════════════════════════════════════════════╗')
	log('║           Batch Code Review with Claude Code             ║')
	log('╚═══════════════════════════════════════════════════════════╝')
	log()
	log(`  Mode:     ${opts.mode}${opts.mode === 'pr' ? ` (base: ${opts.prBase})` : ''}`)
	log(`  Scope:    ${opts.scope}`)
	log(`  Model:    ${opts.model}`)
	log(`  Parallel: ${opts.parallel}`)
	log(`  Batch:    ${opts.batchMode}`)
	log(`  Budget:   ${opts.batchTokenBudget} tokens/batch`)
	log(`  Cascade:  ${!opts.noCascade}`)
	log(`  Graph:    ${opts.withGraph}`)
	if (opts.contextFilter) log(`  Context:  ${opts.contextFilter}`)
	if (opts.outputDir) log(`  Output:   ${opts.outputDir}`)
	log()

	// Collect and classify. Files that clear every skip guard but match no rule are
	// captured (not silently dropped) so a genuine artifact family can't vanish.
	const allFiles = await collectFiles(opts)
	const unclassifiedFiles: string[] = []
	let classified = allFiles
		.map(f => classifyFile(f, opts.contextFilter, opts.scope, uf => unclassifiedFiles.push(uf)))
		.filter((c): c is ClassifiedFile => c !== null)

	if (unclassifiedFiles.length > 0) {
		log(`⚠️  ${unclassifiedFiles.length} in-scope file(s) matched NO classification rule — NOT reviewed (silent-drop guard):`)
		for (const f of unclassifiedFiles) log(`    ? ${f}`)
		log('    If any is a real artifact, add a CLASSIFICATION_RULES entry — this is exactly how jobs/ was silently dropped.')
		log()
	}

	if (classified.length === 0) {
		log('No reviewable files found.')
		process.exit(0)
	}

	// Graph-aware pass: load/build the dependency graph once for the whole run
	// and compute each file's blast radius up front, so the per-batch task
	// loop below only has to look up already-resolved data.
	let graphBatch: ReviewBatchResult | null = null
	if (opts.withGraph) {
		const graphCtx = await loadGraphContext(opts.rebuildGraph, log)
		if (graphCtx) {
			graphBatch = graphReviewBatch(
				graphCtx,
				classified.map(c => c.file),
				{
					depth: opts.graphDepth,
					maxDownstream: opts.graphMaxDownstream,
				},
			)
			log(
				`  Graph-aware pass: ${graphBatch.summary.filesWithGraphNodes}/${graphBatch.summary.totalFiles} file(s) mapped to graph nodes (blast radius: ${graphBatch.summary.blastRadius} downstream nodes).`,
			)
		}
		log()
	}

	// print mode: no dir, no file writes, no skip-already-reviewed
	const effectiveOutputDir = opts.print ? '' : opts.outputDir || resolve(PROJECT_ROOT, '.review-tmp')
	if (effectiveOutputDir) mkdirSync(effectiveOutputDir, { recursive: true })

	// Keep full list for cascade analysis (includes already-reviewed files)
	const allClassified = [...classified]

	// Filter already-reviewed files (skip in print mode — always re-review)
	if (!opts.print && effectiveOutputDir) {
		const before = classified.length
		classified = classified.filter(c => {
			const safeName = c.file.replace(/\//g, '_')
			return !existsSync(resolve(effectiveOutputDir, `${safeName}.md`))
		})
		const skipped = before - classified.length
		if (skipped > 0) {
			log(`Skipped ${skipped} already-reviewed file(s).`)
			log()
		}
	}

	if (classified.length === 0 && opts.noCascade) {
		log('No new files to review.')
		process.exit(0)
	}

	if (classified.length > 0) {
		// Summary
		log(`Files to review: ${classified.length}`)
		log('─────────────────────────────────────────────────────────────')
		for (const c of classified) {
			log(`  [${c.artifact.padEnd(12)}] ${c.file}`)
		}
		log('─────────────────────────────────────────────────────────────')
		log()

		const batches: ReviewBatch[] = opts.batchMode
			? buildReviewBatches(classified, opts.batchTokenBudget)
			: classified
					.sort((a, b) => a.file.localeCompare(b.file))
					.map(file => {
						const checklist = getCompiledChecklist(file.skill, file.lang, file.artifact)
						const plan = getReviewReadPlan(file)
						return {
							skill: file.skill,
							lang: file.lang,
							artifact: file.artifact,
							files: [file],
							estimatedTokens:
								estimateTokens(checklist.compactText) + BASE_PROMPT_TOKEN_OVERHEAD + estimateFileReviewTokens(plan, checklist.all.length),
						}
					})

		const totalTokens = batches.reduce((sum, b) => sum + b.estimatedTokens, 0)
		log(
			`  ${opts.batchMode ? 'Batch' : 'Single-file'} mode: ${classified.length} files → ${batches.length} review unit(s) (~${totalTokens} tokens total)`,
		)
		for (const batch of batches) {
			log(`    [${batch.skill}/${batch.lang}/${batch.artifact}] ${batch.files.length} file(s), ~${batch.estimatedTokens} tokens`)
		}
		log()

		if (opts.dryRun) {
			log('(dry run — no reviews executed)')
			process.exit(0)
		}

		const sem = createSemaphore(opts.parallel)

		// Files with at least one graph node — the only ones eligible for the
		// graph-aware pass. Computed once; batches below just filter against it.
		const graphEligibleFiles = new Set(graphBatch?.files.filter(f => f.nodes.length > 0).map(f => f.file) ?? [])

		// Files that never got a written report — either the batch threw (API stall,
		// 32k output overflow, rate/session limit) or the model omitted the file from
		// its response. We never fabricate a clean report: a missing report is honest,
		// a fake-clean one is not. These are listed with a re-run hint, counted in the
		// summary, and force a non-zero exit so a limit-blocked run can't masquerade as
		// a clean review.
		const unreviewedFiles: string[] = []

		async function runOneBatch(batch: ReviewBatch, i: number) {
			const checklist = getCompiledChecklist(batch.skill, batch.lang, batch.artifact)
			log(
				`  [${i + 1}/${batches.length}] Reviewing ${batch.files.length} ${batch.skill}/${batch.lang}/${batch.artifact} file(s) (~${batch.estimatedTokens} tok)...`,
			)

			const reviewResults = await runReviewBatch(batch, checklist, opts.model)

			// Graph-aware pass runs as a separate LLM call, only for files this
			// batch has that resolved to a graph node. Failures here are logged
			// and swallowed — the checklist review for this batch must not be
			// lost because the second pass errored.
			let graphFindingsByFile = new Map<string, GraphFinding[]>()
			const graphFilesInBatch = batch.files.filter(f => graphEligibleFiles.has(f.file))
			if (graphBatch && graphFilesInBatch.length > 0) {
				try {
					const graphContextText = buildGraphContextText(graphFilesInBatch, graphBatch)
					graphFindingsByFile = await runGraphAwareBatch(graphFilesInBatch, graphContextText, opts.model)
				} catch (err) {
					log(`    ✗ graph-aware pass failed for batch ${i + 1}: ${err instanceof Error ? err.message : String(err)}`)
				}
			}

			const renderedReports: string[] = []
			for (const file of batch.files) {
				const review = reviewResults.get(file.file)
				if (!review) {
					// Batch failed or the model omitted this file — no report is
					// written (a missing report is honest; a fake-clean one is not).
					unreviewedFiles.push(file.file)
					log(`    ✗ ${file.file} — unreviewed (batch failed)`)
					continue
				}

				const report = renderReviewReport(file, checklist, review) + renderGraphFindings(graphFindingsByFile.get(file.file) ?? [])

				if (!opts.print && effectiveOutputDir) {
					const safeName = file.file.replace(/\//g, '_')
					const outPath = resolve(effectiveOutputDir, `${safeName}.md`)
					writeFileSync(outPath, report)
					log(`    ✓ ${file.file} → ${outPath}`)
				} else {
					log(`    ✓ ${file.file}`)
				}

				renderedReports.push(report)
			}

			if (opts.print || !opts.outputDir) {
				console.log(renderedReports.join('\n\n---\n\n'))
			}
		}

		// A single failed batch (API stall, 32k output overflow, rate/session limit)
		// must not kill the whole run — log it, mark its not-yet-reported files
		// unreviewed, and let the remaining batches finish; failed files can be re-run.
		const tasks = batches.map((batch, i) =>
			sem(async () => {
				try {
					await runOneBatch(batch, i)
				} catch (err) {
					for (const f of batch.files) {
						if (!unreviewedFiles.includes(f.file)) unreviewedFiles.push(f.file)
					}
					log(
						`  ✗ [${i + 1}/${batches.length}] batch ${batch.skill}/${batch.lang}/${batch.artifact} failed: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`,
					)
				}
			}),
		)

		await Promise.all(tasks)

		log()
		log('═══════════════════════════════════════════════════════════')
		log(`  Phase 1 complete. ${classified.length - unreviewedFiles.length}/${classified.length} files reviewed.`)
		if (unreviewedFiles.length > 0) {
			log(`  ⚠️  ${unreviewedFiles.length} file(s) UNREVIEWED (batch failures — API stall / 32k overflow / rate or session limit).`)
			log('      No reports were written for them; re-run with:')
			log(`    bun scripts/review.ts ${unreviewedFiles.join(' ')}`)
			process.exitCode = 1
		}
		if (opts.outputDir) log(`  Reports saved to: ${opts.outputDir}/`)
		log('═══════════════════════════════════════════════════════════')
	}

	// Phase 2: Cascade Impact Analysis
	if (!opts.noCascade && effectiveOutputDir) {
		const cascadeResult = await runCascadeAnalysis(allClassified, effectiveOutputDir, opts.model)

		if (cascadeResult) {
			log()
			if (opts.print) console.log(cascadeResult)
			else if (!opts.outputDir) console.log(cascadeResult)
		}
	}

	// Clean up temp dir if no output dir was specified (not needed in print mode)
	if (!opts.print && !opts.outputDir && effectiveOutputDir) {
		rmSync(effectiveOutputDir, { recursive: true, force: true })
	}

	log()
	log('═══════════════════════════════════════════════════════════')
	log(`  Done. ${allClassified.length} files total, ${classified.length} newly reviewed.`)
	if (unclassifiedFiles.length > 0) {
		log(`  ⚠️  ${unclassifiedFiles.length} in-scope file(s) unclassified (no rule matched) — listed above.`)
	}
	if (opts.outputDir) log(`  Reports: ${opts.outputDir}/`)
	log('═══════════════════════════════════════════════════════════')
}

// Only run when invoked directly (bun scripts/review.ts …). Importing the module —
// e.g. the support-file smoke check that exercises classifyFile / getReviewReadPlan —
// must not kick off a whole review run.
if (import.meta.main) {
	main().catch(err => {
		console.error(err)
		process.exit(1)
	})
}
