#!/usr/bin/env bun
/**
 * review-plan.ts — Review the code embedded in an implementation plan
 * BEFORE shipping, using the same skill registries as scripts/review.ts.
 *
 * Usage:
 *   bun scripts/review-plan.ts .plans/<file>.md
 *   bun scripts/review-plan.ts .plans/<file>.md --task 1
 *   bun scripts/review-plan.ts .plans/<file>.md --model sonnet
 *
 * How it works:
 *   1. Parses the plan markdown — for each `## Task N:` section, collects every
 *      `Create:` and `Modify:` path declaration in order, then every fenced
 *      TypeScript/tsx code block. Each code block is attributed to the most
 *      recent preceding path declaration in the same task. Multiple blocks
 *      targeting the same path are concatenated into one virtual file.
 *   2. Materializes the virtual files at `.review-plan-tmp/<path>` so the
 *      existing classifier in review.ts picks the right skill from the path.
 *   3. Delegates to `bun scripts/review.ts` with `--no-cascade` (cascade impact
 *      analysis assumes a real import graph, which a plan doesn't have yet).
 *
 * Limitations:
 *   - `diff` fences are not extracted — they're not parseable as standalone TS.
 *     Surrounding ```typescript blocks within the same Task are extracted.
 *   - Files at paths not matched by review.ts's CLASSIFICATION_RULES are
 *     reported as "skipped" (e.g. `packages/app/src/lib/csv.ts` — no skill
 *     registry covers `lib/`).
 *   - Imports referenced in the snippet that don't yet exist on disk are silently
 *     omitted from the reviewer's context; structural BPs and `when: always`
 *     patterns are still evaluated against the snippet text.
 *   - For Modify-targeted blocks, the materialized virtual file is a partial
 *     snippet, not the whole file. Pattern checks that require whole-file
 *     context (e.g. "barrel export present") may report false positives.
 */

import { readFileSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { parseArgs } from 'node:util'
import { getGenerators, resolvePlatform } from './cli/resolve'

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname)
const PROJECT_ROOT = resolve(SCRIPT_DIR, '..')
const TMP_PREFIX = '.review-plan-tmp'

type ExtractedFile = {
	taskId: string
	taskName: string
	destPath: string
	code: string
	mode: 'create' | 'modify'
}

type PlanToken = { kind: 'path'; mode: 'create' | 'modify'; path: string; offset: number } | { kind: 'code'; code: string; offset: number }

// ---------------------------------------------------------------------------
// Edit block parsing + application
// ---------------------------------------------------------------------------

export type EditBlock = { path?: string; search: string; replace: string }

const EDIT_FENCE = /```edit(?:\s+path=(\S+))?\n([\s\S]*?)```/g
const SEARCH_REPLACE = /<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE/

export function parseEditBlocks(taskBody: string): EditBlock[] {
	const blocks: EditBlock[] = []
	for (const fence of taskBody.matchAll(EDIT_FENCE)) {
		const sr = SEARCH_REPLACE.exec(fence[2]!)
		if (!sr) continue
		blocks.push({ path: fence[1], search: sr[1]!, replace: sr[2]! })
	}
	return blocks
}

export function applyEdits(content: string, edits: EditBlock[]): string {
	let out = content
	for (const e of edits) {
		const first = out.indexOf(e.search)
		if (first === -1) throw new Error(`[review-plan] SEARCH block not found in scaffolded content:\n${e.search}`)
		if (out.indexOf(e.search, first + 1) !== -1) throw new Error(`[review-plan] SEARCH block matches more than once:\n${e.search}`)
		out = out.slice(0, first) + e.replace + out.slice(first + e.search.length)
	}
	return out
}

// ---------------------------------------------------------------------------
// bun cli invocation parsing
// ---------------------------------------------------------------------------

export type CliInvocation = { verb: string; positional: string[]; flags: Record<string, string> }

// Matches `bun cli <verb> <rest-of-line>` (in a bash fence or inline). Mirrors the
// flag parsing in scripts/cli.ts: --flag=value, --flag value, bare --flag (=true).
const CLI_LINE = /\bbun\s+cli\s+([^\n`]+)/g

export function extractCliInvocations(taskBody: string): CliInvocation[] {
	const out: CliInvocation[] = []
	for (const m of taskBody.matchAll(CLI_LINE)) {
		const tokens = m[1]!.trim().split(/\s+/)
		const verb = tokens.shift()
		if (!verb) continue
		const positional: string[] = []
		const flags: Record<string, string> = {}
		for (let i = 0; i < tokens.length; i++) {
			const t = tokens[i]!
			if (t.startsWith('--')) {
				const body = t.slice(2)
				const eq = body.indexOf('=')
				if (eq !== -1) flags[body.slice(0, eq)] = body.slice(eq + 1)
				else if (tokens[i + 1] && !tokens[i + 1]!.startsWith('-')) flags[body] = tokens[++i]!
				else flags[body] = 'true'
			} else {
				positional.push(t)
			}
		}
		out.push({ verb, positional, flags })
	}
	return out
}

// ---------------------------------------------------------------------------
// Scaffold-then-mutate reconstruction
// ---------------------------------------------------------------------------

// Sentinel error class used to intercept `process.exit` inside generators so a
// broken invocation (missing required flag, e.g. `route` without `--i18n`) is
// silently skipped rather than killing the review-plan process.
class GeneratorExitError extends Error {
	constructor(readonly code: number | undefined) {
		super(`generator called process.exit(${code})`)
	}
}

// Run `fn` with `process.exit` monkey-patched to throw `GeneratorExitError` so
// that generators that validate their flags (and exit on missing ones) don't kill
// the host process. The patch is restored in a `finally` block.
async function safeRun<T>(fn: () => Promise<T>): Promise<T | null> {
	const realExit = process.exit.bind(process)
	;(process as NodeJS.Process & { exit: (code?: number) => never }).exit = (code?: number) => {
		throw new GeneratorExitError(code)
	}
	try {
		return await fn()
	} catch (e) {
		if (e instanceof GeneratorExitError) return null
		throw e
	} finally {
		process.exit = realExit
	}
}

// Reconstruct the final files for a scaffold-then-mutate Task: run each `bun cli`
// generator (backend or frontend) in-memory, apply the Task's edit blocks to the
// matching file. Returns [] when the Task has no scaffold step (caller falls back
// to snippet extraction). Generators that call process.exit (e.g. missing required
// flag) are silently skipped.
export async function reconstructTaskFiles(taskBody: string): Promise<Array<{ filePath: string; content: string }>> {
	const invocations = extractCliInvocations(taskBody)
	if (invocations.length === 0) return []
	const edits = parseEditBlocks(taskBody)
	// New format: scaffold step + a full proposed-file ```typescript block (no `edit` diffs) —
	// defer to whole-file token attribution so the plan's PROPOSED final code is reviewed, not the
	// bare skeleton. But that shadow only applies when a TS fence EXISTS to attribute: a scaffold
	// task with neither edits nor a proposed block (the Go shape — token path never parses go
	// fences) still reconstructs, because the rendered registry snippet IS the reviewable content.
	if (edits.length === 0 && /```(?:typescript|ts|tsx)\n/.test(taskBody)) return []
	const results: Array<{ filePath: string; content: string }> = []

	for (const inv of invocations) {
		const lang = inv.flags.lang === 'go' ? 'go' : 'typescript'
		const platform = resolvePlatform(inv.flags.platform)
		const gen = getGenerators(lang, platform, inv.verb)[inv.verb]
		if (!gen) continue // unknown verb — fall back to snippet extraction
		// Suppress the frontend generators' locale-JSON write; we only want the in-memory file(s).
		const generated = await safeRun(() => Promise.resolve(gen(inv.positional, { ...inv.flags, 'no-i18n-write': 'true' })))
		if (!generated) continue // generator exited (missing required flag) — skip
		for (const file of generated) {
			const fileEdits = edits.filter(e => !e.path || file.filePath.endsWith(e.path))
			results.push({ filePath: file.filePath, content: applyEdits(file.content, fileEdits) })
		}
	}
	return results
}

function tokenizeTaskBody(body: string): PlanToken[] {
	const tokens: PlanToken[] = []

	const pathDecl = /(Create|Modify)[^\n]*?`([^`]+\.[tj]sx?)`/g
	for (const match of body.matchAll(pathDecl)) {
		const mode = match[1]!.toLowerCase() === 'create' ? 'create' : 'modify'
		tokens.push({ kind: 'path', mode, path: match[2]!, offset: match.index })
	}

	const codeFence = /```(?:typescript|ts|tsx)\n([\s\S]*?)```/g
	for (const match of body.matchAll(codeFence)) {
		tokens.push({ kind: 'code', code: match[1]!, offset: match.index })
	}

	tokens.sort((a, b) => a.offset - b.offset)
	return tokens
}

export async function parsePlan(md: string): Promise<ExtractedFile[]> {
	// Canonical grammar (single source: scripts/graph/cli/plan-parser.ts TASK_HEADING).
	const taskRe = /^## Task (T\d+[a-z]?):\s*(.+)$/gm
	const tasks: Array<{ id: string; name: string; start: number; end: number }> = []

	for (const match of md.matchAll(taskRe)) {
		tasks.push({ id: match[1]!, name: match[2]!.trim(), start: match.index, end: md.length })
	}
	for (let i = 0; i < tasks.length - 1; i++) tasks[i]!.end = tasks[i + 1]!.start

	const finalIdx = md.indexOf('\n## Final Validation')
	if (finalIdx !== -1 && tasks.length > 0) {
		const last = tasks[tasks.length - 1]!
		if (finalIdx > last.start && finalIdx < last.end) last.end = finalIdx
	}

	const merged = new Map<string, ExtractedFile>()

	for (const task of tasks) {
		const body = md.slice(task.start, task.end)

		// Try scaffold-then-mutate reconstruction first; if the task contains a
		// `bun cli` backend invocation, emit the reconstructed files and skip the
		// token-attribution loop (which only handles whole-file typescript blocks).
		const reconstructed = await reconstructTaskFiles(body)
		if (reconstructed.length > 0) {
			for (const r of reconstructed) {
				merged.set(`${task.id}::${r.filePath}`, {
					taskId: task.id,
					taskName: task.name,
					destPath: r.filePath,
					code: r.content,
					mode: 'create',
				})
			}
			continue
		}

		const tokens = tokenizeTaskBody(body)

		let currentPath: { path: string; mode: 'create' | 'modify' } | null = null
		for (const tok of tokens) {
			if (tok.kind === 'path') {
				currentPath = { path: tok.path, mode: tok.mode }
				continue
			}
			if (!currentPath) continue

			const key = `${task.id}::${currentPath.path}`
			const existing = merged.get(key)
			if (existing) {
				existing.code += `\n// — next snippet —\n${tok.code}`
			} else {
				merged.set(key, {
					taskId: task.id,
					taskName: task.name,
					destPath: currentPath.path,
					code: tok.code,
					mode: currentPath.mode,
				})
			}
		}
	}

	return [...merged.values()]
}

async function main() {
	const { values, positionals } = parseArgs({
		args: Bun.argv.slice(2),
		options: {
			task: { type: 'string', default: '' },
			model: { type: 'string', default: 'haiku' },
			parallel: { type: 'string', default: '1' },
			'dry-run': { type: 'boolean', default: false },
			help: { type: 'boolean', short: 'h', default: false },
		},
		allowPositionals: true,
		strict: true,
	})

	if (values.help || positionals.length === 0) {
		console.log(`review-plan.ts — Review code snippets embedded in an implementation plan

Usage:
  bun scripts/review-plan.ts .plans/<file>.md
  bun scripts/review-plan.ts .plans/<file>.md --task 1
  bun scripts/review-plan.ts .plans/<file>.md --model sonnet
  bun scripts/review-plan.ts .plans/<file>.md --dry-run

Options:
  --task ID     Filter to a single Task (e.g. --task 1)
  --model M     Claude model (default: haiku). Accepts haiku/sonnet/opus.
  --dry-run     Print what would be reviewed without calling Claude.
`)
		process.exit(values.help ? 0 : 1)
	}

	const planArg = positionals[0]!
	const planPath = resolve(PROJECT_ROOT, planArg)
	if (!existsSync(planPath)) {
		console.error(`Plan file not found: ${planArg}`)
		process.exit(1)
	}

	const md = readFileSync(planPath, 'utf-8')
	let files = await parsePlan(md)

	if (values.task) {
		const taskId = /^T/i.test(String(values.task)) ? String(values.task) : `T${values.task}`
		files = files.filter(f => f.taskId === taskId)
	}

	if (files.length === 0) {
		console.error('No reviewable `Create `<path>`:` code blocks found in plan.')
		process.exit(1)
	}

	console.log(`# Review plan: ${planArg}\n`)
	console.log(`Found ${files.length} virtual file(s) to review:\n`)
	for (const f of files) {
		console.log(`  - ${f.taskId} [${f.mode}]: ${f.destPath} (${f.code.split('\n').length} lines)`)
	}
	console.log()

	if (values['dry-run']) {
		console.log('--dry-run set; skipping Claude call.')
		process.exit(0)
	}

	const tmpRoot = resolve(PROJECT_ROOT, TMP_PREFIX)
	if (existsSync(tmpRoot)) rmSync(tmpRoot, { recursive: true, force: true })

	const tmpPaths: string[] = []
	for (const f of files) {
		const tmpPath = resolve(tmpRoot, f.destPath)
		mkdirSync(dirname(tmpPath), { recursive: true })
		writeFileSync(tmpPath, f.code, 'utf-8')
		tmpPaths.push(`${TMP_PREFIX}/${f.destPath}`)
	}

	console.log(`> bun scripts/review.ts ${tmpPaths.length} files --model ${values.model} --no-cascade\n`)
	console.log('Note: this is plan-mode review. Findings reflect projected code; some')
	console.log('dependencies referenced by imports do not exist on disk yet, so the')
	console.log('reviewer evaluates structural BPs and patterns against the snippet text.\n')

	const proc = Bun.spawn(
		[
			'bun',
			resolve(SCRIPT_DIR, 'review.ts'),
			...tmpPaths,
			'--model',
			String(values.model),
			'--parallel',
			String(values.parallel),
			'--no-cascade',
		],
		{
			cwd: PROJECT_ROOT,
			stdout: 'inherit',
			stderr: 'inherit',
		},
	)
	const exitCode = await proc.exited

	rmSync(tmpRoot, { recursive: true, force: true })
	process.exit(exitCode)
}

// Only auto-run when this file is the entry point, not when imported by tests.
if (import.meta.main) {
	main().catch(err => {
		console.error(err)
		process.exit(1)
	})
}
