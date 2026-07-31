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
 *   CP-03  route shell (routes/**\/index.tsx) calling a data hook                error
 *   CP-04  component that renders a root the caller cannot reach: no className
 *          surface, or a className that never lands on the root                 error
 *
 * CP-01 vs CP-04 — two halves that used to be conflated (founder ratification, 30/07):
 *   · `className` is UNIVERSAL (CP-04). A module that renders a root accepts className and
 *     merges it on that root, WHATEVER the case of the root tag. `<ThreadCard />` whose root
 *     is `<Card>` and which declares no className is a dead end: the caller cannot add `mt-4`
 *     or a `data-testid`, and the next dev copies the component instead of composing it.
 *   · The BLIND SPREAD (`{...props}`) stays CONDITIONAL (CP-01, DOM roots only). On a
 *     controlled root (ToggleGroup/Tabs/Select) an arbitrary spread fights the controlled
 *     contract — that is the only real hazard, and it was never about className.
 * The exemptions are therefore only two, and both are structural rather than whitelisted:
 *   (a) route modules — the router instantiates them, there is no caller to pass a prop.
 *       Falls out of the GLOBS below: route.tsx / __root.tsx / a route's own index.tsx are
 *       not under -components/ and not under components/.
 *   (b) a module that renders no single host root — a fragment with siblings, a context
 *       Provider (nothing to attach a class to; its slot components carry the surface — see
 *       DataTable vs DataTableContent), or a file that is not a component at all
 *       (components/console/glyphs.tsx is an icon map, it declares no component).
 * Anything else that seems to want an exemption is a finding to report, not a whitelist entry.
 *
 * WHY ui/ IS STILL EXCLUDED (re-decided 30/07, kept): the primitives are covered by rail C,
 * `packages/app/react/tests/architecture/primitive-props.test.ts`. It owns the DECLARATION half
 * (a *Props must extend the root's vocabulary) and, since this pass, the PLUMBING half (a root
 * that carries a literal className plus a `{...props}` spread clobbers the caller's className —
 * cn() is what merges it). Moving ui/ here instead would be a VACUOUS gate: componentBlocks()
 * only sees `^export function X`, and 34 of the 40 primitive files export through a bottom
 * barrel (`export { Dialog, DialogContent, ... }`) — 168 primitive components exist and this
 * walker would see a handful. The rail runs where the primitives live and reads all of them.
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

/**
 * The opening tag of the component's first JSX root — `<Card className={cn('mb-4', className)}>` —
 * or null when there is none. Brace-balanced so a `>` inside a prop expression (`onClick={() => x}`)
 * does not end the tag early.
 */
export function rootOpeningTag(body: string): string | null {
	const m = body.match(/return(?:\s*\(\s*|\s+)</)
	if (!m) return null
	const open = (m.index ?? 0) + m[0].length - 1
	let depth = 0
	for (let i = open; i < body.length; i++) {
		const c = body[i]
		if (c === '{') depth++
		else if (c === '}') depth--
		else if (c === '>' && depth === 0) return body.slice(open, i + 1)
	}
	return null
}

/** Does the component expose a className surface — destructured param, or a ComponentProps-typed bag? */
export function declaresClassName(block: ComponentBlock, source: string): boolean {
	return /\bclassName\b/.test(block.signature) || usesComponentProps(block, source)
}

/**
 * Does the caller's className actually LAND on the root? Three honest forms:
 *   `{...props}` spread (the props bag carries className),
 *   `className={cn('defaults', className)}` (root has its own classes — cn merges),
 *   `className={className}` (root has no classes of its own — forwarding IS the merge).
 * A literal `className="…"` next to a spread is NOT a merge: last-write-wins clobbers one side.
 */
export function classNameReachesRoot(tag: string): boolean {
	const literal = /className=(["'`])/.test(tag)
	const spread = /\{\.\.\.[A-Za-z_$][\w$]*\}/.test(tag)
	const merged = /className=\{[^}]*\bcn\(/.test(tag) || /className=\{\s*className\s*\}/.test(tag)
	if (merged) return true
	return spread && !literal
}

/** The source text of `name`'s own declaration, up to the next top-level declaration. */
function declarationOf(name: string, source: string): string | null {
	const m = source.match(new RegExp(`^(?:export\\s+)?(?:function|const)\\s+${name}\\b`, 'm'))
	if (!m) return null
	const after = source.slice((m.index ?? 0) + m[0].length)
	const next = after.search(/^(?:export |function |const |interface |type )/m)
	return next === -1 ? after : after.slice(0, next)
}

/** Resolve `name` to its defining source: this file, or the module this file imports it from. */
function definitionSource(name: string, source: string, file: string): string | null {
	const local = declarationOf(name, source)
	if (local) return local
	const imported = [...source.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'([^']+)'/g)].find(m =>
		m[1].split(',').some(
			s =>
				s
					.trim()
					.replace(/^type\s+/, '')
					.split(/\s+as\s+/)[0]
					.trim() === name,
		),
	)
	if (!imported) return null
	const spec = imported[2]
	const base = spec.startsWith('@/') ? join(REACT_SRC, spec.slice(2)) : spec.startsWith('.') ? join(dirname(file), spec) : null
	if (!base) return null // node_modules — not ours to resolve
	for (const candidate of [`${base}.tsx`, `${base}.ts`, join(base, 'index.tsx')]) {
		if (existsSync(candidate)) return declarationOf(name, readFileSync(candidate, 'utf-8'))
	}
	return null
}

/**
 * Can a className reach this root AT ALL? Exemption (b), decided structurally instead of by
 * whitelist — the exemption is exactly the case where the requirement is impossible, and the
 * compiler agrees:
 *   · lowercase DOM tag → always reachable.
 *   · `X.Provider` / `X.Consumer` → a context provider renders no element (DataTable's root);
 *     the surface lives in its slot components (DataTableContent), which do take className.
 *   · uppercase root → resolve OUR wrapper for it. A wrapper that names className (destructures,
 *     cn()-merges) or is typed from a DOM element is reachable. A wrapper that only spreads a
 *     headless `*.Root.Props` is not: Base UI's own d.ts for PopoverRoot says "Groups all parts of
 *     the popover. Doesn't render its own HTML element." — `Pick<ComponentProps<typeof Popover>,
 *     'className'>` does not type-check, so demanding it would be demanding a tsc error.
 *   · unresolvable (a node_modules component such as Link) → assume reachable; demanding className
 *     is the safe default.
 * Residual: a wrapper that merely spreads a root which DOES render an element (a Radix `Root`)
 * reads as unreachable here. Rail C's plumbing assertion pushes those wrappers to cn()-merge,
 * which flips them back to reachable; none is an app-component root today (measured).
 */
export function rootAcceptsClassName(root: string, source: string, file: string): boolean {
	if (/^[a-z]/.test(root)) return true
	if (root.includes('.')) return !/\.(Provider|Consumer)$/.test(root)
	const def = definitionSource(root, source, file)
	if (def === null) return true
	return /className/.test(def) || /ComponentProps\s*<\s*'/.test(def)
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
			// CP-04 — className is universal: the caller must be able to reach whatever root this
			// component renders, uppercase or lowercase. Exemption (b) is structural: no host root.
			if (root && rootAcceptsClassName(root, source, file)) {
				const tag = rootOpeningTag(block.body) ?? ''
				const declares = declaresClassName(block, source)
				const reaches = classNameReachesRoot(tag)
				if (!declares || !reaches) {
					const why = !declares
						? `declares no className (type it from the root: ComponentProps<${/^[a-z]/.test(root) ? `'${root}'` : `typeof ${root}`}>)`
						: 'declares className but never lands it on the root (merge with cn() there)'
					findings.push({
						detector: 'component-props',
						ruleId: 'CP-04',
						source: 'component#bp-29',
						file: rel(file),
						line: lineOf(source, block.index),
						severity: 'error',
						message: `${block.name} renders a <${root}> root and ${why} — the caller cannot reach it (component bp-29).`,
					})
				}
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
