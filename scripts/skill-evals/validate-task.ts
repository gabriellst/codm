#!/usr/bin/env bun
/**
 * validate-task.ts — free-real-estate validator for synthetic (agent-only) probes.
 *
 * A synthetic probe measures ONLY new work iff, at HEAD:
 *   - every `grep-must` matches NOTHING (the idiom doesn't exist yet),
 *   - every `file-exists` finds NOTHING (the artifact doesn't exist yet),
 *   - every `grep-must-not` already passes (the probe doesn't blame pre-existing code),
 *   - every `tsc` / `detect` / `cmd` gate is green (a red gate would fail any build),
 *   - `test-green` targets that exist already pass.
 * `judge` graders are skipped (LLM; validated by running the probe).
 *
 * Authoring protocol (PROBES-BACKLOG.md) requires this to pass before a probe's first
 * agent run. Runs the graders against the CURRENT repo root (no worktree).
 *
 * Usage:
 *   bun scripts/skill-evals/validate-task.ts <task-id> [<task-id> ...]
 *   bun scripts/skill-evals/validate-task.ts --all-synthetic
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { runGrader } from './graders'
import type { GradeResult, Task } from './types'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(SCRIPT_DIR, '../..')
const TASKS_DIR = join(SCRIPT_DIR, 'tasks')

function loadTask(id: string): Task {
	const raw = readFileSync(join(TASKS_DIR, `${id}.yaml`), 'utf-8')
	return parseYaml(raw) as Task
}

/** Expected HEAD outcome per grader kind for a free-real-estate-clean synthetic probe. */
function expectation(kind: string, spec: string): 'fail' | 'pass' | 'skip' {
	switch (kind) {
		case 'grep-must':
		case 'file-exists':
			return 'fail'
		case 'test-green':
			// A suite the AGENT will create (path absent at HEAD) is expected to fail now;
			// an existing suite is a regression guard and must already be green.
			return existsSync(join(REPO, spec)) ? 'pass' : 'fail'
		case 'grep-must-not':
		case 'tsc':
		case 'detect':
		case 'cmd':
			return 'pass'
		default:
			return 'skip' // judge
	}
}

async function validate(id: string): Promise<boolean> {
	const task = loadTask(id)
	if (task.goldRef || task.baseRef) {
		console.log(`— ${id}: has goldRef/baseRef (not a HEAD-synthetic probe) — skipping`)
		return true
	}
	console.log(`▶ ${id} (${task.graders.length} graders)`)
	let ok = true
	const results = await Promise.all(
		task.graders.map(async g => ({
			g,
			want: expectation(g.kind, g.spec),
			r: expectation(g.kind, g.spec) === 'skip' ? null : await runGrader(task, g, REPO),
		})),
	)
	for (const { g, want, r } of results) {
		if (want === 'skip' || r === null) continue
		const got: 'pass' | 'fail' = (r as GradeResult).pass ? 'pass' : 'fail'
		if (got !== want) {
			ok = false
			console.log(`  ✗ ${g.kind}:${g.spec.slice(0, 90)} — expected ${want.toUpperCase()} at HEAD, got ${got.toUpperCase()}`)
			console.log(`    ${(r as GradeResult).detail.split('\n')[0]}`)
		}
	}
	console.log(
		ok
			? `  ✓ free real estate verified (${task.graders.length} graders)`
			: '  ✗ NOT clean — fix the graders or the premise before any agent run',
	)
	return ok
}

if (import.meta.main) {
	const args = process.argv.slice(2)
	const ids = args.includes('--all-synthetic')
		? readdirSync(TASKS_DIR)
				.filter(f => f.startsWith('synthetic-') && f.endsWith('.yaml'))
				.map(f => f.replace(/\.yaml$/, ''))
		: args.filter(a => !a.startsWith('--'))
	if (ids.length === 0) {
		console.error('usage: bun scripts/skill-evals/validate-task.ts <task-id...> | --all-synthetic')
		process.exit(1)
	}
	let allOk = true
	for (const id of ids) allOk = (await validate(id)) && allOk
	process.exit(allOk ? 0 : 1)
}
