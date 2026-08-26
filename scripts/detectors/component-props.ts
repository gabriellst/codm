#!/usr/bin/env bun
/**
 * component-props.ts — path-aware walker for app-react route shells.
 *
 * WHAT THIS FILE STILL OWNS (one rule):
 *   CP-03  a route shell (`routes/**\/index.tsx`, not `-components/` / `-hooks/` / `-stores/`)
 *          must not call an SDK data hook — index.tsx is a thin shell and fetching belongs to
 *          the components that own their data (route bp-13 / CMP-P01).            error
 * It lives in a walker rather than in eslint because the rule is about WHERE the file sits: the
 * same `useGetX()` call is correct one directory deeper. k=2 measured (dashchart iters 3+10).
 *
 * WHAT LEFT, AND WHY (31/07). CP-01 (a DOM root owes the caller a spread), CP-02 (hand-typed
 * `className?: string`) and CP-04 (className is UNIVERSAL — every component that renders a root
 * accepts one and merges it) moved to the type-aware eslint rule `local/component-props`
 * (scripts/eslint-rules/component-props.ts). They are NOT duplicated here: one doctrine, one gate.
 *
 * The move was not cosmetic. This walker split files with `^export function X`, so it could not see
 * the design system at all — 34 of the 40 files in `components/ui/` export through a barrel at the
 * bottom (`export { Dialog, DialogContent, … }`), which is 168 primitive components read as six, and
 * `ui/` had to be excluded from the globs for exactly that reason. The eslint rule sees every
 * declaration whatever the export shape and now evaluates 337 components, 283 of them in `ui/`.
 *
 * The FILENAME stays `component-props` deliberately: `scripts/skill-evals/graders.ts` and ten eval
 * task specs address this detector by that name (`detect: component-props`). Renaming it to
 * `route-shell` is a follow-up for whenever that grader contract is next revised — not something to
 * smuggle into a doctrine migration.
 *
 * Usage:
 *   bun scripts/detectors/component-props.ts [--json] [--update-baseline] [--no-baseline]
 *
 * ROOT_OVERRIDE (env) retargets the walked tree (eval worktrees). Baseline ratchet:
 * scripts/detectors/component-props.baseline.json — pre-existing debt keyed by
 * `rule::file::component`; new findings still gate. Exit 1 iff a non-baselined error.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

export interface Finding {
	detector: string
	ruleId: string
	source: string
	file: string
	line: number
	severity: 'error' | 'warning' | 'info'
	message: string
}

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname)
const PROJECT_ROOT = process.env.ROOT_OVERRIDE ? resolve(process.env.ROOT_OVERRIDE) : resolve(SCRIPT_DIR, '../..')
const BASELINE_FILE = join(SCRIPT_DIR, 'component-props.baseline.json')
const REACT_SRC = join(PROJECT_ROOT, 'packages/app/react/src')

function rel(path: string): string {
	return relative(PROJECT_ROOT, path).replaceAll('\\', '/')
}

function lineOf(source: string, index: number): number {
	return source.slice(0, index).split('\n').length
}

/** Is this route entry a SHELL — the route's own index.tsx, not one of its `-`-prefixed modules? */
export function isRouteShell(entry: string): boolean {
	return !/-components\/|-hooks\/|-stores\//.test(entry)
}

/** The first SDK read hook a shell calls (`useGetX(` / `useListX(`), or null. */
export function dataHookCall(source: string): RegExpMatchArray | null {
	return source.match(/use(?:Get|List)[A-Z]\w*\(/)
}

export async function walk(): Promise<Finding[]> {
	const findings: Finding[] = []
	if (!existsSync(REACT_SRC)) return findings
	for await (const entry of new Bun.Glob('routes/**/index.tsx').scan({ cwd: REACT_SRC, onlyFiles: true })) {
		if (!isRouteShell(entry)) continue
		const file = join(REACT_SRC, entry)
		const source = readFileSync(file, 'utf-8')
		const m = dataHookCall(source)
		if (!m) continue
		findings.push({
			detector: 'component-props',
			ruleId: 'CP-03',
			source: 'route#bp-13',
			file: rel(file),
			line: lineOf(source, m.index ?? 0),
			severity: 'error',
			message:
				'route shell calls a data hook / tenancy store — index.tsx is a thin shell; fetching belongs in -components/ (CMP-P01 data ownership).',
		})
	}
	return findings
}

export function baselineKey(f: Finding): string {
	return `${f.ruleId}::${f.file}::${f.message.split(' ')[0]}`
}

function loadBaseline(): Set<string> {
	if (!existsSync(BASELINE_FILE)) return new Set()
	return new Set(JSON.parse(readFileSync(BASELINE_FILE, 'utf-8')) as string[])
}

if (import.meta.main) {
	const args = process.argv.slice(2)
	const findings = await walk()

	if (args.includes('--update-baseline')) {
		const keys = [...new Set(findings.map(baselineKey))].sort()
		writeFileSync(BASELINE_FILE, `${JSON.stringify(keys, null, '\t')}\n`)
		console.log(`baseline updated: ${keys.length} key(s) → ${relative(PROJECT_ROOT, BASELINE_FILE)}`)
		process.exit(0)
	}
	const baseline = args.includes('--no-baseline') ? new Set<string>() : loadBaseline()
	const gating = findings.filter(f => !baseline.has(baselineKey(f)))

	if (args.includes('--json')) {
		console.log(JSON.stringify(findings, null, 2))
	} else {
		for (const f of findings) {
			const mark = baseline.has(baselineKey(f)) ? ' [baselined debt]' : ''
			console.log(`${f.file}:${f.line} [${f.severity}] ${f.ruleId} (${f.source}) — ${f.message}${mark}`)
		}
		const ratchet =
			findings.length - gating.length > 0 ? ` (${findings.length - gating.length} baselined — ratchet via --update-baseline)` : ''
		console.log(`\n${findings.length} finding(s), ${gating.length} gating${ratchet}`)
	}
	process.exit(gating.length > 0 ? 1 : 0)
}
