#!/usr/bin/env bun
/**
 * coverage.ts — which atlas axes have eval coverage, and how are they scoring?
 *
 * The feature GENERATOR's input: an axis with no task forcing its decision is invisible
 * to the loop — the next invented feature should be designed to force exactly those
 * decisions. Pass rates come from agent-mode scoreboard rows (gold rows validate graders,
 * not docs, so they don't count as coverage evidence).
 *
 * Usage: bun scripts/skill-evals/feature-loop/coverage.ts [--json]
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { loadTasks } from '../run'
import type { ScoreRow } from '../types'
import { fileURLToPath } from 'node:url'

const EV = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MAIN_REPO = resolve(EV, '../..')

interface AxisRow {
	axis: string
	rung: string
	tasks: string[]
	agentRuns: number
	agentPasses: number
}

function loadAxes(): { id: string; rung: string }[] {
	const doc = parseYaml(readFileSync(join(MAIN_REPO, '.claude/atlas/axes.yaml'), 'utf8')) as {
		axes: { id: string; rung: string }[]
	}
	return doc.axes
}

function loadScoreRows(): ScoreRow[] {
	const dir = join(EV, 'scoreboard')
	if (!existsSync(dir)) return []
	const rows: ScoreRow[] = []
	for (const f of readdirSync(dir)) {
		if (!f.endsWith('.jsonl')) continue
		for (const line of readFileSync(join(dir, f), 'utf8').split('\n')) {
			if (line.trim()) rows.push(JSON.parse(line) as ScoreRow)
		}
	}
	return rows
}

export function coverage(): AxisRow[] {
	const tasks = loadTasks()
	const rows = loadScoreRows().filter(r => r.mode === 'agent')
	const byTask = new Map<string, { runs: number; passes: number }>()
	for (const r of rows) {
		const t = byTask.get(r.task) ?? { runs: 0, passes: 0 }
		t.runs++
		if (r.pass) t.passes++
		byTask.set(r.task, t)
	}
	return loadAxes().map(axis => {
		const covering = tasks.filter(t => t.axes?.includes(axis.id))
		const agg = covering.reduce(
			(acc, t) => {
				const s = byTask.get(t.id)
				return s ? { runs: acc.runs + s.runs, passes: acc.passes + s.passes } : acc
			},
			{ runs: 0, passes: 0 },
		)
		return { axis: axis.id, rung: axis.rung, tasks: covering.map(t => t.id), agentRuns: agg.runs, agentPasses: agg.passes }
	})
}

if (import.meta.main) {
	const rowsOut = coverage()
	if (process.argv.includes('--json')) {
		console.log(JSON.stringify(rowsOut, null, '\t'))
	} else {
		const w = Math.max(...rowsOut.map(r => r.axis.length))
		console.log(`${'axis'.padEnd(w)}  rung      tasks  agent runs  passes`)
		for (const r of rowsOut.sort((a, b) => a.tasks.length - b.tasks.length || a.axis.localeCompare(b.axis))) {
			const flag = r.tasks.length === 0 ? '  ← UNCOVERED' : r.agentRuns === 0 ? '  ← never agent-run' : ''
			console.log(
				`${r.axis.padEnd(w)}  ${r.rung.padEnd(8)}  ${String(r.tasks.length).padStart(5)}  ${String(r.agentRuns).padStart(10)}  ${String(r.agentPasses).padStart(6)}${flag}`,
			)
		}
		const uncovered = rowsOut.filter(r => r.tasks.length === 0)
		console.log(`\n${uncovered.length} uncovered axis(es): ${uncovered.map(r => r.axis).join(', ') || '—'}`)
	}
}
