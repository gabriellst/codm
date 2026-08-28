/**
 * scoreboard-report.ts — analytics over the JSONL scoreboard.
 *
 * The scoreboard is a pile of append-only stamp files (scoreboard/<stamp>.jsonl),
 * one ScoreRow per task per run. Until now the operator greps it by hand. This
 * reads ALL agent-mode rows and prints:
 *
 *   (a) THE BOARD       — latest verdict per task (highest ts wins across stamps),
 *                         with score X/Y (Y = grader count in the task yaml,
 *                         X = Y - failedGraders.length), classified PERFECT / RED.
 *   (b) ITERATION TREND — per task, the score progression across its rows by ts.
 *   (c) MODEL COMPARE   — sonnet vs default/fable (rows with no `model` field).
 *   (d) FAILED FAMILIES — the top recurring failed-grader families across RED rows.
 *
 * replay-* / holdout-* / feature-* tasks are excluded from the ACTIVE board count
 * and listed in a separate section.
 *
 *   bun scripts/skill-evals/scoreboard-report.ts          # terminal report
 *   bun scripts/skill-evals/scoreboard-report.ts --json   # machine-readable
 */

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import { parse as parseYaml } from 'yaml'
import type { ScoreRow, Task } from './types'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const SCOREBOARD_DIR = join(SCRIPT_DIR, 'scoreboard')
const TASKS_DIR = join(SCRIPT_DIR, 'tasks')

// ─── ANSI (suppressed under --json / non-TTY) ───────────────────────

const useColor = process.stdout.isTTY && !process.argv.includes('--json')
const c = (code: string) => (s: string | number) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s))
const bold = c('1')
const dim = c('2')
const green = c('32')
const red = c('31')
const yellow = c('33')
const cyan = c('36')

// ─── Task-bucket classification ─────────────────────────────────────

type Bucket = 'active' | 'replay' | 'holdout' | 'feature'

function bucketOf(task: string): Bucket {
	if (task.startsWith('replay-')) return 'replay'
	if (task.startsWith('holdout-')) return 'holdout'
	if (task.startsWith('feature-')) return 'feature'
	return 'active'
}

// ─── Grader-count (Y) per task, from the task yaml ──────────────────

const graderCountCache = new Map<string, number | null>()

function graderCount(task: string): number | null {
	if (graderCountCache.has(task)) return graderCountCache.get(task) ?? null
	let count: number | null = null
	try {
		const raw = readFileSync(join(TASKS_DIR, `${task}.yaml`), 'utf8')
		const parsed = parseYaml(raw) as Partial<Task>
		if (Array.isArray(parsed.graders)) count = parsed.graders.length
	} catch {
		count = null // task yaml gone (renamed/removed) — score becomes pass/fail only
	}
	graderCountCache.set(task, count)
	return count
}

// ─── Failed-grader family ───────────────────────────────────────────

/** A grader label is `<family>#<id>` or `<family>:<spec>` (graderLabel in graders.ts).
 * The family is the head before the first '#' or ':'. Judge specs carry long prose;
 * we collapse them all to the `judge` family. */
function familyOf(label: string): string {
	const head = label.split(/[#:]/, 1)[0]?.trim()
	return head && head.length > 0 && head.length < 24 ? head : 'judge'
}

// ─── Row loading ────────────────────────────────────────────────────

interface LoadedRow extends ScoreRow {
	stamp: string
}

function loadAgentRows(): LoadedRow[] {
	const rows: LoadedRow[] = []
	for (const file of readdirSync(SCOREBOARD_DIR)) {
		if (!file.endsWith('.jsonl')) continue
		const stamp = file.replace(/\.jsonl$/, '')
		const text = readFileSync(join(SCOREBOARD_DIR, file), 'utf8')
		for (const line of text.split('\n')) {
			const trimmed = line.trim()
			if (!trimmed) continue
			let row: ScoreRow
			try {
				row = JSON.parse(trimmed) as ScoreRow
			} catch {
				continue // skip malformed line, don't abort the report
			}
			if (row.mode !== 'agent') continue
			rows.push({ ...row, stamp })
		}
	}
	return rows
}

// ─── Score helpers ──────────────────────────────────────────────────

interface Score {
	x: number
	y: number | null // null when the task yaml is gone
	failed: number
}

function scoreOf(row: ScoreRow): Score {
	const y = graderCount(row.task)
	const failed = row.failedGraders.length
	const x = y === null ? (row.pass ? 1 : 0) : Math.max(0, y - failed)
	return { x, y, failed }
}

function modelOf(row: ScoreRow): string {
	return row.model ?? 'default'
}

const byTs = (a: { ts: string }, b: { ts: string }) => a.ts.localeCompare(b.ts)

// ─── Analysis ───────────────────────────────────────────────────────

interface TaskTrend {
	task: string
	bucket: Bucket
	rows: LoadedRow[] // ascending ts
	latest: LoadedRow
	score: Score
	classification: 'PERFECT' | 'RED'
}

function analyze(rows: LoadedRow[]) {
	const byTask = new Map<string, LoadedRow[]>()
	for (const row of rows) {
		const list = byTask.get(row.task) ?? []
		list.push(row)
		byTask.set(row.task, list)
	}

	const trends: TaskTrend[] = []
	for (const [task, taskRows] of byTask) {
		taskRows.sort(byTs)
		const latest = taskRows[taskRows.length - 1]
		const score = scoreOf(latest)
		trends.push({
			task,
			bucket: bucketOf(task),
			rows: taskRows,
			latest,
			score,
			classification: latest.pass ? 'PERFECT' : 'RED',
		})
	}
	trends.sort((a, b) => a.task.localeCompare(b.task))
	return trends
}

// ─── Model comparison ───────────────────────────────────────────────

interface ModelStat {
	model: string
	runs: number
	perfect: number
	graderInstances: number // sum of Y over rows with a known Y
	graderPasses: number // sum of X over those rows
}

function modelComparison(rows: LoadedRow[]): ModelStat[] {
	const stats = new Map<string, ModelStat>()
	for (const row of rows) {
		const model = modelOf(row)
		const s = stats.get(model) ?? { model, runs: 0, perfect: 0, graderInstances: 0, graderPasses: 0 }
		s.runs++
		if (row.pass) s.perfect++
		const score = scoreOf(row)
		if (score.y !== null) {
			s.graderInstances += score.y
			s.graderPasses += score.x
		}
		stats.set(model, s)
	}
	return [...stats.values()].sort((a, b) => b.runs - a.runs)
}

// ─── Failed-family ranking (latest RED row per task — current pain) ──

interface FamilyStat {
	family: string
	failures: number // total failed-grader instances in this family
	tasks: Set<string> // distinct tasks where the family failed
}

function failedFamilies(trends: TaskTrend[]): FamilyStat[] {
	const fams = new Map<string, FamilyStat>()
	for (const trend of trends) {
		if (trend.classification !== 'RED') continue
		for (const label of trend.latest.failedGraders) {
			const fam = familyOf(label)
			const s = fams.get(fam) ?? { family: fam, failures: 0, tasks: new Set<string>() }
			s.failures++
			s.tasks.add(trend.task)
			fams.set(fam, s)
		}
	}
	return [...fams.values()].sort((a, b) => b.failures - a.failures || b.tasks.size - a.tasks.size)
}

// ─── Rendering ──────────────────────────────────────────────────────

function fmtScore(score: Score): string {
	if (score.y === null) return score.x ? 'PASS' : 'FAIL'
	return `${score.x}/${score.y}`
}

function renderBoard(trends: TaskTrend[], heading: string): string[] {
	const lines: string[] = []
	if (trends.length === 0) return lines
	const w = Math.max(...trends.map(t => t.task.length))
	const perfect = trends.filter(t => t.classification === 'PERFECT').length
	lines.push(bold(`${heading}  ${green(perfect)}/${trends.length} perfect`))
	for (const t of trends) {
		const tag = t.classification === 'PERFECT' ? green('● PERFECT') : red('● RED    ')
		const score = (t.classification === 'PERFECT' ? green : yellow)(fmtScore(t.score).padStart(6))
		const fails = t.classification === 'RED' ? dim(` ← ${[...new Set(t.latest.failedGraders.map(familyOf))].join(', ')}`) : ''
		const runs = dim(`(${t.rows.length} run${t.rows.length === 1 ? '' : 's'}, ${modelOf(t.latest)})`)
		lines.push(`  ${tag}  ${t.task.padEnd(w)}  ${score}  ${runs}${fails}`)
	}
	return lines
}

function renderTrend(trends: TaskTrend[]): string[] {
	const lines: string[] = [bold('ITERATION TREND  ') + dim('(score per run, oldest → newest)')]
	const w = Math.max(...trends.map(t => t.task.length))
	for (const t of trends) {
		const seq = t.rows
			.map(r => {
				const s = scoreOf(r)
				const txt = fmtScore(s)
				return r.pass ? green(txt) : yellow(txt)
			})
			.join(dim(' → '))
		const arrow = t.classification === 'PERFECT' ? green('✓') : red('✗')
		lines.push(`  ${arrow} ${t.task.padEnd(w)}  ${seq}`)
	}
	return lines
}

function renderModels(stats: ModelStat[]): string[] {
	const lines: string[] = [bold('MODEL COMPARISON  ') + dim('(sonnet vs default/fable)')]
	const w = Math.max(6, ...stats.map(s => s.model.length))
	lines.push(dim(`  ${'model'.padEnd(w)}   runs  perfect   grader-pass-rate`))
	for (const s of stats) {
		const perfectPct = s.runs ? Math.round((s.perfect / s.runs) * 100) : 0
		const graderPct = s.graderInstances ? Math.round((s.graderPasses / s.graderInstances) * 100) : 0
		lines.push(
			`  ${cyan(s.model.padEnd(w))}   ${String(s.runs).padStart(4)}   ${String(s.perfect).padStart(3)}/${String(s.runs).padStart(3)} ${dim(`(${perfectPct}%)`)}   ${String(graderPct).padStart(3)}% ${dim(`(${s.graderPasses}/${s.graderInstances})`)}`,
		)
	}
	return lines
}

function renderFamilies(fams: FamilyStat[]): string[] {
	const lines: string[] = [bold('TOP FAILED-GRADER FAMILIES  ') + dim('(across current RED tasks)')]
	if (fams.length === 0) {
		lines.push(`  ${green('none — every active task is green')}`)
		return lines
	}
	const w = Math.max(6, ...fams.slice(0, 12).map(f => f.family.length))
	for (const f of fams.slice(0, 12)) {
		const bar = red('█'.repeat(Math.min(f.failures, 30)))
		lines.push(
			`  ${f.family.padEnd(w)}  ${String(f.failures).padStart(3)} ${dim(`fail / ${f.tasks.size} task${f.tasks.size === 1 ? '' : 's'}`)}  ${bar}`,
		)
	}
	return lines
}

// ─── Main ───────────────────────────────────────────────────────────

function main() {
	const { values } = parseArgs({ options: { json: { type: 'boolean', default: false } }, allowPositionals: true })

	const rows = loadAgentRows()
	const trends = analyze(rows)

	const active = trends.filter(t => t.bucket === 'active')
	const replay = trends.filter(t => t.bucket === 'replay')
	const holdout = trends.filter(t => t.bucket === 'holdout')
	const feature = trends.filter(t => t.bucket === 'feature')
	const nonActive = [...replay, ...holdout, ...feature].sort((a, b) => a.task.localeCompare(b.task))

	const models = modelComparison(rows)
	const fams = failedFamilies(active)

	if (values.json) {
		const serializeTrend = (t: TaskTrend) => ({
			task: t.task,
			bucket: t.bucket,
			classification: t.classification,
			score: { x: t.score.x, y: t.score.y },
			model: modelOf(t.latest),
			latestTs: t.latest.ts,
			runs: t.rows.length,
			failedGraderFamilies: [...new Set(t.latest.failedGraders.map(familyOf))],
			progression: t.rows.map(r => {
				const s = scoreOf(r)
				return { ts: r.ts, x: s.x, y: s.y, pass: r.pass, model: modelOf(r) }
			}),
		})
		const out = {
			generatedAt: new Date().toISOString(),
			totals: {
				agentRows: rows.length,
				tasks: trends.length,
				active: { total: active.length, perfect: active.filter(t => t.classification === 'PERFECT').length },
				nonActive: nonActive.length,
			},
			board: {
				active: active.map(serializeTrend),
				replay: replay.map(serializeTrend),
				holdout: holdout.map(serializeTrend),
				feature: feature.map(serializeTrend),
			},
			models: models.map(s => ({
				model: s.model,
				runs: s.runs,
				perfect: s.perfect,
				perfectRate: s.runs ? s.perfect / s.runs : 0,
				graderPasses: s.graderPasses,
				graderInstances: s.graderInstances,
				graderPassRate: s.graderInstances ? s.graderPasses / s.graderInstances : 0,
			})),
			topFailedFamilies: fams.map(f => ({ family: f.family, failures: f.failures, tasks: [...f.tasks].sort() })),
		}
		process.stdout.write(`${JSON.stringify(out, null, 2)}\n`)
		return
	}

	const out: string[] = []
	const rule = dim('─'.repeat(72))
	out.push('')
	out.push(bold(cyan('  SKILL-EVALS SCOREBOARD REPORT')))
	out.push(dim(`  ${rows.length} agent rows · ${trends.length} tasks · ${active.length} active · ${nonActive.length} non-active`))
	out.push('')
	out.push(rule)
	out.push(...renderBoard(active, 'ACTIVE BOARD'))
	out.push('')
	out.push(rule)
	out.push(...renderTrend(active))
	out.push('')
	out.push(rule)
	out.push(...renderModels(models))
	out.push('')
	out.push(rule)
	out.push(...renderFamilies(fams))
	out.push('')
	out.push(rule)
	if (nonActive.length > 0) {
		out.push(...renderBoard(nonActive, 'NON-ACTIVE  (replay / holdout / feature — excluded from board count)'))
		out.push('')
	}
	process.stdout.write(`${out.join('\n')}\n`)
}

main()
