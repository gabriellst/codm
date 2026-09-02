#!/usr/bin/env bun
/**
 * validate-grader-ids.ts — guards grader-id uniqueness across every tasks/*.yaml.
 *
 * WHY: scoreboards key a failed grader by its `id` (GraderSpec.id ?? `${kind}:${spec}`).
 * When two graders in the SAME task carry the SAME id, a red line on the board can't tell
 * you WHICH grader (which spec) actually failed — the failure is ambiguous and costs real
 * debug time. So:
 *
 *   - SAME id + SAME spec within one task  → TRUE duplicate → HARD FAIL (exit 1).
 *     There is no reason to grade the identical (glob::regex / target) twice under one label;
 *     it's a copy-paste slip that silently swallows one of the two failures.
 *   - SAME id + DIFFERENT specs within one task → intentional multi-grader-per-rule → WARN.
 *     A single canon (e.g. form#FRM-P44) is legitimately probed by several distinct greps
 *     (a must + a must-not + a positional-access ban). The shared id is the RULE name; the
 *     specs differ. We surface these so an author can eyeball them, but they don't fail.
 *
 * Secondary check: every id's "<skill>#..." prefix should name a real skill directory under
 * .claude/skills/ (or a known author prefix — atlas / universal / detect). Unknown prefixes
 * WARN only (authors legitimately coin probe-local prefixes like statcard#, pixelfunnel#,
 * ac1#); they never fail the run.
 *
 * Usage:
 *   bun scripts/skill-evals/validate-grader-ids.ts
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { graderLabel } from './graders'
import type { Task } from './types'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(SCRIPT_DIR, '../..')
const TASKS_DIR = join(SCRIPT_DIR, 'tasks')
const SKILLS_DIR = join(REPO, '.claude', 'skills')

/** Author prefixes that are NOT skill dirs but are sanctioned (see the dispatch table). */
const KNOWN_NON_SKILL_PREFIXES = ['atlas', 'universal', 'detect'] as const

// ─── Core dup-detection (pure, exported for unit tests) ─────────────

/** A grader id that recurs within one task. `trueDup` ⇒ same id appears with the same spec. */
export interface DuplicateId {
	/** The repeated grader id (GraderSpec.id ?? `${kind}:${spec}`). */
	id: string
	/** Total occurrences of this id in the task. */
	count: number
	/** The distinct specs the id was attached to (sorted, deduped). */
	specs: string[]
	/** True ⇒ at least one (id, spec) pair occurs more than once — an accidental dup. */
	trueDup: boolean
}

/**
 * Find every grader id that appears more than once in a single task.
 *
 * Groups the task's graders by their effective label (explicit `id` or `${kind}:${spec}`),
 * keeps only the labels with 2+ occurrences, and marks `trueDup` when the SAME spec recurs
 * under that label (the ambiguous case the validator hard-fails on).
 */
export function findDuplicateIds(task: Pick<Task, 'graders'>): DuplicateId[] {
	const byId = new Map<string, string[]>() // id → specs (in declaration order, WITH repeats)
	for (const g of task.graders) {
		const id = graderLabel(g)
		const list = byId.get(id)
		if (list) list.push(g.spec)
		else byId.set(id, [g.spec])
	}

	const dups: DuplicateId[] = []
	for (const [id, specs] of byId) {
		if (specs.length < 2) continue
		const distinct = [...new Set(specs)].sort()
		// True dup ⇔ some spec recurs ⇔ fewer distinct specs than total occurrences.
		const trueDup = distinct.length < specs.length
		dups.push({ id, count: specs.length, specs: distinct, trueDup })
	}
	// Stable, deterministic output: true dups first, then by id.
	return dups.sort((a, b) => Number(b.trueDup) - Number(a.trueDup) || a.id.localeCompare(b.id))
}

// ─── Skill-prefix check (pure, exported for unit tests) ─────────────

/** Directory names directly under .claude/skills/ (the valid skill prefixes). */
export function skillDirNames(skillsDir = SKILLS_DIR): Set<string> {
	if (!existsSync(skillsDir)) return new Set()
	return new Set(
		readdirSync(skillsDir).filter(name => {
			try {
				return statSync(join(skillsDir, name)).isDirectory()
			} catch {
				return false
			}
		}),
	)
}

/** The "<prefix>#" of an id, or null when the id carries no "#". */
export function idPrefix(id: string): string | null {
	const hash = id.indexOf('#')
	return hash > 0 ? id.slice(0, hash) : null
}

/** True ⇒ the prefix is a real skill dir or a sanctioned author prefix. */
export function isKnownPrefix(prefix: string, skills: Set<string>): boolean {
	return skills.has(prefix) || (KNOWN_NON_SKILL_PREFIXES as readonly string[]).includes(prefix)
}

// ─── Report ─────────────────────────────────────────────────────────

interface TaskReport {
	taskId: string
	dups: DuplicateId[]
	unknownPrefixes: { id: string; prefix: string }[]
}

function loadTask(file: string): Task {
	return parseYaml(readFileSync(join(TASKS_DIR, file), 'utf-8')) as Task
}

function buildReports(): TaskReport[] {
	const skills = skillDirNames()
	const files = readdirSync(TASKS_DIR)
		.filter(f => f.endsWith('.yaml'))
		.sort()

	const reports: TaskReport[] = []
	for (const file of files) {
		const task = loadTask(file)
		if (!Array.isArray(task.graders)) continue
		const dups = findDuplicateIds(task)

		const unknownPrefixes: { id: string; prefix: string }[] = []
		const seenUnknown = new Set<string>()
		for (const g of task.graders) {
			const id = graderLabel(g)
			const prefix = idPrefix(id)
			if (!prefix || isKnownPrefix(prefix, skills)) continue
			if (seenUnknown.has(id)) continue
			seenUnknown.add(id)
			unknownPrefixes.push({ id, prefix })
		}

		if (dups.length > 0 || unknownPrefixes.length > 0) {
			reports.push({ taskId: task.id ?? file.replace(/\.yaml$/, ''), dups, unknownPrefixes })
		}
	}
	return reports
}

function main(): number {
	const reports = buildReports()

	let trueDupCount = 0
	let warnDupCount = 0
	let unknownPrefixCount = 0

	for (const { taskId, dups, unknownPrefixes } of reports) {
		const trueDups = dups.filter(d => d.trueDup)
		const warnDups = dups.filter(d => !d.trueDup)
		if (trueDups.length === 0 && warnDups.length === 0 && unknownPrefixes.length === 0) continue

		console.log(`\n▶ ${taskId}`)

		for (const d of trueDups) {
			trueDupCount++
			console.log(`  ✗ TRUE DUPLICATE id "${d.id}" — ${d.count}× with a REPEATED spec (hides which grader failed)`)
			for (const s of d.specs) console.log(`      spec: ${s}`)
		}
		for (const d of warnDups) {
			warnDupCount++
			console.log(`  ⚠ id "${d.id}" reused ${d.count}× across ${d.specs.length} DISTINCT specs (intentional multi-grader-per-rule?)`)
			for (const s of d.specs) console.log(`      spec: ${s}`)
		}
		for (const { id, prefix } of unknownPrefixes) {
			unknownPrefixCount++
			console.log(`  ⚠ unknown skill prefix "${prefix}#" in id "${id}" (not a .claude/skills/* dir nor a known author prefix)`)
		}
	}

	console.log('\n── grader-id validation summary ──')
	console.log(`  true duplicates (id+spec):     ${trueDupCount}  ${trueDupCount > 0 ? '✗ HARD FAIL' : '✓'}`)
	console.log(`  intentional reuse (id, diff specs): ${warnDupCount}  ⚠ warn`)
	console.log(`  unknown skill prefixes:        ${unknownPrefixCount}  ⚠ warn`)

	if (trueDupCount > 0) {
		console.log('\n✗ FAIL — give each grader a UNIQUE id (or fix the duplicated spec). Same id+spec hides a failing grader.')
		return 1
	}
	console.log('\n✓ OK — no same-id+same-spec duplicates.')
	return 0
}

if (import.meta.main) {
	process.exit(main())
}
