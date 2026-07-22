#!/usr/bin/env bun
/**
 * component-props.ts — structural ComponentProps walker for app-react components.
 *
 * Component bp-20 (canon: a component that renders a DOM presentational root extends
 * ComponentProps<root> so callers pass className + spread props) is enforced at edit
 * time by the classify-edit hook, but its regexes only catch zero-prop components and
 * hand-typed `className?: string` — a component WITH props that renders a DOM root
 * without extending ComponentProps slips through, and the whole-file detect_skip lets
 * one compliant component silence the rest of its file. This walker analyzes EVERY
 * exported component individually, repo-wide. Rung: detect.
 *
 * Checks (scope: routes/** -components/ + src/components/, excluding ui/ primitives,
 * stories, tests — all 161 exported components use `export function`, no const-arrow):
 *   CP-01  exported component whose first JSX root is a lowercase DOM tag and whose
 *          props are not typed by ComponentProps (in the signature or via a local
 *          interface/type extending it)                                        error
 *   CP-02  hand-typed `className?: string` in a props declaration               error
 *
 * bp-20's exemptions fall out naturally: overlay roots (DialogContent/SheetContent/...)
 * and controlled primitive roots (ToggleGroup/Tabs/Select) are UPPERCASE — CP-01 only
 * fires on lowercase DOM roots.
 *
 * Usage:
 *   bun scripts/detectors/component-props.ts [--json] [--update-baseline] [--no-baseline]
 *
 * ROOT_OVERRIDE (env) retargets the walked tree (eval worktrees). Baseline ratchet:
 * scripts/detectors/component-props.baseline.json — pre-existing debt keyed by
 * `file::rule::component`; new findings still gate. Exit 1 iff a non-baselined error.
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

const GLOBS = ['routes/**/-components/**/*.tsx', 'components/**/*.tsx']
const EXCLUDE = /(\.stories\.|\.test\.|\/ui\/)/

function rel(path: string): string {
	return relative(PROJECT_ROOT, path).replaceAll('\\', '/')
}

function lineOf(source: string, index: number): number {
	return source.slice(0, index).split('\n').length
}

async function collectFiles(): Promise<string[]> {
	if (!existsSync(REACT_SRC)) return []
	const out = new Set<string>()
	for (const glob of GLOBS) {
		for await (const entry of new Bun.Glob(glob).scan({ cwd: REACT_SRC, onlyFiles: true })) {
			const full = join(REACT_SRC, entry)
			if (!EXCLUDE.test(full)) out.add(full)
		}
	}
	return [...out].sort()
}

interface ComponentBlock {
	name: string
	signature: string
	body: string
	index: number
}

/** Split a file into exported-function-component blocks (block ends at the next top-level export or EOF). */
export function componentBlocks(source: string): ComponentBlock[] {
	const blocks: ComponentBlock[] = []
	const re = /^export function ([A-Z][A-Za-z0-9]*)/gm
	const matches = [...source.matchAll(re)]
	for (let i = 0; i < matches.length; i++) {
		const start = matches[i].index ?? 0
		const next = source.slice(start + 1).search(/^export /m)
		const end = next === -1 ? source.length : start + 1 + next
		const block = source.slice(start, end)
		// Signature: up to the parameter list's closing `)` followed by `{` or `:` (biome-formatted).
		const sigEnd = block.search(/\)\s*(?::[^{]+)?\{/)
		blocks.push({
			name: matches[i][1],
			signature: sigEnd === -1 ? block.slice(0, 200) : block.slice(0, sigEnd + 1),
			body: block,
			index: start,
		})
	}
	return blocks
}

/** First JSX root tag returned by the component (skips `return null` / fragments find the first element). */
export function jsxRootTag(body: string): string | null {
	for (const m of body.matchAll(/return(?:\s*\(\s*|\s+)</g)) {
		const at = (m.index ?? 0) + m[0].length
		const tag = body.slice(at).match(/^([A-Za-z][A-Za-z0-9.]*)/)?.[1]
		if (tag) return tag
		// `<>` fragment — the root for spread purposes is the first element inside; treat as exempt.
		return null
	}
	return null
}

/** Does this component's props type reference ComponentProps — in the signature or via a local declaration? */
export function usesComponentProps(block: ComponentBlock, source: string): boolean {
	if (/ComponentProps\s*</.test(block.signature)) return true
	// Named props type in the signature (`: XProps` / `: Readonly<XProps>`)
	const typeName = block.signature.match(/:\s*(?:Readonly<)?([A-Z][A-Za-z0-9]*)>?\s*\)$/)?.[1]
	if (!typeName) return false
	const decl = source.match(
		new RegExp(`(?:interface|type)\\s+${typeName}\\b[^{=]*[{=][^]*?(?=\\n(?:interface|type|export|const|function)\\s|$)`),
	)
	return decl ? /ComponentProps\s*</.test(decl[0]) : false
}

export async function walk(): Promise<Finding[]> {
	const findings: Finding[] = []
	for (const file of await collectFiles()) {
		const source = readFileSync(file, 'utf-8')
		for (const block of componentBlocks(source)) {
			const root = jsxRootTag(block.body)
			if (root && /^[a-z]/.test(root) && !usesComponentProps(block, source)) {
				findings.push({
					detector: 'component-props',
					ruleId: 'CP-01',
					source: 'component#bp-20',
					file: rel(file),
					line: lineOf(source, block.index),
					severity: 'error',
					message: `${block.name} renders a <${root}> root without extending ComponentProps<'${root}'> — callers cannot pass className/spread props (component bp-20).`,
				})
			}
		}
		for (const m of source.matchAll(/className\?:\s*string/g)) {
			findings.push({
				detector: 'component-props',
				ruleId: 'CP-02',
				source: 'component#bp-20',
				file: rel(file),
				line: lineOf(source, m.index ?? 0),
				severity: 'error',
				message: 'hand-typed `className?: string` — extend ComponentProps<root> instead (component bp-20).',
			})
		}
	}
	// CP-03 — thin route shells (route bp-13): a route index.tsx (not -components/-hooks/
	// -stores) must not call SDK data hooks or the tenancy store (CMP-P01 data ownership).
	// k=2 measured (dashchart iters 3+10). Lives here because registry detect_skip is
	// whole-text and slice-closure walks backend files only.
	for await (const entry of new Bun.Glob('routes/**/index.tsx').scan({ cwd: REACT_SRC, onlyFiles: true })) {
		if (/-components\/|-hooks\/|-stores\//.test(entry)) continue
		const file = join(REACT_SRC, entry)
		const source = readFileSync(file, 'utf-8')
		const m = source.match(/use(?:Get|List)[A-Z]\w*\(/)
		if (m) {
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
