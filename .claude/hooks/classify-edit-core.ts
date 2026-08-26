#!/usr/bin/env bun
/**
 * classify-edit-core.ts — the registry-rule engine behind the classify-edit hook.
 *
 * Pure pieces (no stdin, no hook envelope — those live in classify-edit.ts):
 *   detectLang(path) → re-exported from scripts/lib/repo-model (derived from REPO.workspaces)
 *   globToRegExp(glob) → end-anchored RegExp ( `*`, `**`, `**​/`, literal escapes )
 *   matchSkill(path, componentsIndex) → longest-positive-pattern-wins, `!negative` excludes
 *   resolveRegistryPath(skill, lang) → <skill>/<lang>/registry.yaml when it exists, else flat
 *   loadUniversalRules() → cc-bp-04's detect/detect_skip from .claude/registry.yaml
 *                          (hardcoded legacy list as fallback when cc-bp-04 lacks detect)
 *   loadMechanicalRules(skill, lang) → universal + skill + one level of context_reads
 *   runRules(rules, text) → matched rules; whole-text detect, whole-text detect_skip
 *
 * Also a standalone CLI (shared detector contract):
 *   bun .claude/hooks/classify-edit-core.ts [--json] [--all] [files...]
 *   exit 1 iff any severity==='error' finding, else 0.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { detectLang, type SkillLang } from '../../scripts/lib/repo-model'

// Repo root from this file (<root>/.claude/hooks/classify-edit-core.ts) — cwd-independent.
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

// Lang is repo-model's SkillLang — derived from REPO.workspaces (CLAUDE.md §5); the hook keeps
// the `Lang` alias for its public surface but declares no union of its own.
export type Lang = SkillLang
export { detectLang }
export type Severity = 'error' | 'warning' | 'info'

export interface Rule {
	id: string
	rule: string
	skill: string
	severity: Severity
	/** Verbatim registry `severity:` value (critical/high/moderate/…) — detectors map it themselves. */
	rawSeverity?: string
	detect: RegExp[]
	skip: RegExp[]
	/** Registry `scope: self` — the rule never travels through context_reads to neighbor skills. */
	scopeSelf?: boolean
}

/** Shared detector contract — what the CLI emits. */
export interface Finding {
	detector: string
	ruleId: string
	source: string
	file: string
	line: number
	severity: Severity
	message: string
	excerpt?: string
}

// ── Universal set — legacy hardcoded list, now the FALLBACK when cc-bp-04 lacks `detect`.
// `sample` is a probe string: a registry detect pattern that matches a sample adopts that
// rule's id + message, keeping the hook's output byte-identical to the pre-registry era.
const LEGACY_UNIVERSAL = [
	{ id: 'as-any', rule: '`as any` discards all type safety — type it properly', pattern: '\\bas\\s+any\\b', sample: 'x as any' },
	{ id: 'as-never', rule: '`as never` casts the type away — narrow with a guard, never cast to `never`', pattern: '\\bas\\s+never\\b', sample: 'x as never' },
	{ id: 'as-unknown', rule: '`as unknown` is usually a double-cast escape — fix the source type', pattern: '\\bas\\s+unknown\\b', sample: 'x as unknown' },
	{ id: 'ts-ignore', rule: '@ts-ignore suppresses the error instead of fixing its cause', pattern: '@ts-ignore\\b', sample: '// @ts-ignore' },
	{ id: 'ts-expect-error', rule: '@ts-expect-error suppresses the error instead of fixing its cause', pattern: '@ts-expect-error\\b', sample: '// @ts-expect-error' },
	{ id: 'eslint-disable', rule: 'eslint-disable hides a lint rule instead of fixing it', pattern: 'eslint-disable\\b', sample: '/* eslint-disable */' },
] as const

export function toArray<T>(v: T | T[] | null | undefined): T[] {
	if (v == null) return []
	return Array.isArray(v) ? v : [v]
}

export function safeRegExp(pattern: unknown): RegExp | null {
	try {
		return new RegExp(String(pattern))
	} catch {
		return null
	}
}

function mapSeverity(raw: unknown): Severity {
	if (raw === 'critical' || raw === 'error') return 'error'
	if (raw === 'info') return 'info'
	return 'warning'
}

/** Prefer <skill>/<lang>/registry.yaml when it EXISTS (filesystem decides — no variant lists); else the flat root. */
export function resolveRegistryPath(skill: string, lang: Lang): string {
	const variant = resolve(ROOT, `.claude/skills/${skill}/${lang}/registry.yaml`)
	if (existsSync(variant)) return variant
	return resolve(ROOT, `.claude/skills/${skill}/registry.yaml`)
}

/** Compile a registry.yaml glob (`*`, `**`, literal segments) into an end-anchored RegExp. */
export function globToRegExp(glob: string): RegExp | null {
	let body = ''
	for (let i = 0; i < glob.length; i++) {
		const c = glob[i]
		if (c === '*') {
			if (glob[i + 1] === '*') {
				if (glob[i + 2] === '/') {
					// `**/` matches zero OR more path segments (incl. the dir sitting directly here)
					body += '(?:.*/)?'
					i += 2
				} else {
					body += '.*'
					i++
				}
			} else {
				body += '[^/]*'
			}
		} else if ('\\^$.|?+()[]{}'.includes(c)) {
			body += `\\${c}`
		} else {
			body += c
		}
	}
	// Not start-anchored: patterns begin at `packages/…`, callers pass absolute paths.
	try {
		return new RegExp(`${body}$`)
	} catch {
		return null
	}
}

export interface ComponentDef {
	skill?: string
	patterns?: string[]
}

/**
 * Match a file against the `components` index of .claude/registry.yaml.
 * A component matches when a positive pattern hits AND no `!negative` pattern does.
 * When several components match (e.g. form vs component both end in index.tsx), the one
 * whose matched positive pattern is the most specific (longest) wins.
 */
export function matchSkill(file: string, components: Record<string, ComponentDef>): { skill: string; artifact: string } | null {
	let best: { skill: string; artifact: string } | null = null
	let bestLen = -1

	for (const [artifact, def] of Object.entries(components ?? {})) {
		const patterns = toArray(def?.patterns)
		let matchedLen = -1
		for (const raw of patterns) {
			if (typeof raw !== 'string' || raw.startsWith('!')) continue
			const re = globToRegExp(raw)
			if (re?.test(file) && raw.length > matchedLen) matchedLen = raw.length
		}
		if (matchedLen < 0) continue

		let excluded = false
		for (const raw of patterns) {
			if (typeof raw !== 'string' || !raw.startsWith('!')) continue
			const re = globToRegExp(raw.slice(1))
			if (re?.test(file)) {
				excluded = true
				break
			}
		}
		if (excluded) continue

		if (matchedLen > bestLen) {
			bestLen = matchedLen
			best = { skill: def?.skill ?? artifact, artifact }
		}
	}
	return best
}

const docCache = new Map<string, Record<string, unknown>>()

function loadRegistryDoc(path: string): Record<string, unknown> {
	const cached = docCache.get(path)
	if (cached) return cached
	let doc: Record<string, unknown> = {}
	if (existsSync(path)) {
		try {
			doc = (parseYaml(readFileSync(path, 'utf8')) as Record<string, unknown>) ?? {}
		} catch {
			doc = {}
		}
	}
	docCache.set(path, doc)
	return doc
}

export function loadComponentsIndex(): Record<string, ComponentDef> {
	const doc = loadRegistryDoc(resolve(ROOT, '.claude/registry.yaml'))
	return (doc.components as Record<string, ComponentDef>) ?? {}
}

/**
 * Universal rules — flagged on EVERY in-scope file regardless of skill routing.
 * Single source: .claude/registry.yaml → cross_cutting_bad_practices — EVERY entry
 * with mechanical: true + a usable `detect` loads (cc-bp-04 casts, cc-bp-16 nativeEnum,
 * cc-bp-20 DrizzleClient leak, cc-bp-21 naming, …). cc-bp-04's patterns keep their
 * legacy per-pattern ids/messages ([as-any], [ts-ignore], …) so hook output stays
 * byte-identical. Falls back to the legacy hardcoded cast list only when cc-bp-04 is
 * missing or has no usable `detect`.
 */
export function loadUniversalRules(): Rule[] {
	const fallback = (): Rule[] =>
		LEGACY_UNIVERSAL.map(l => ({
			id: l.id,
			rule: l.rule,
			skill: 'universal',
			severity: 'error' as Severity,
			rawSeverity: 'critical',
			detect: [new RegExp(l.pattern)],
			skip: [],
		}))

	const doc = loadRegistryDoc(resolve(ROOT, '.claude/registry.yaml'))
	const reg = (doc.registry as Record<string, unknown>) ?? doc
	const entries = toArray(reg.cross_cutting_bad_practices as unknown[])
		.map(bp => bp as Record<string, unknown>)
		.filter(bp => bp?.mechanical === true)

	const ccBp04 = entries.find(bp => bp.id === 'cc-bp-04')
	if (!ccBp04 || toArray(ccBp04.detect).length === 0) return fallback()

	const rules: Rule[] = []
	for (const entry of entries) {
		const skip = toArray(entry.detect_skip)
			.map(safeRegExp)
			.filter((r): r is RegExp => r != null)
		const severity = mapSeverity(entry.severity)
		if (entry.id === 'cc-bp-04') {
			// One rule PER PATTERN, mapped back to the legacy id/message via sample probe.
			for (const pattern of toArray(entry.detect).map(String)) {
				const re = safeRegExp(pattern)
				if (!re) continue
				const legacy = LEGACY_UNIVERSAL.find(l => re.test(l.sample))
				rules.push({
					id: legacy?.id ?? String(entry.id),
					rule: legacy?.rule ?? String(entry.rule || entry.name || entry.id || ''),
					skill: 'universal',
					severity,
					rawSeverity: String(entry.severity ?? 'critical'),
					detect: [re],
					skip,
				})
			}
			continue
		}
		const detect = toArray(entry.detect)
			.map(safeRegExp)
			.filter((r): r is RegExp => r != null)
		if (detect.length === 0) continue
		rules.push({
			id: String(entry.id),
			rule: String(entry.rule || entry.name || entry.id || ''),
			skill: 'universal',
			severity,
			rawSeverity: String(entry.severity ?? 'critical'),
			detect,
			skip,
		})
	}
	return rules.length > 0 ? rules : fallback()
}

/** Pull the `mechanical: true` bad_practices (with a `detect` array) out of one skill registry. */
function readMechanicalRules(path: string, skill: string): Rule[] {
	const doc = loadRegistryDoc(path)
	const reg = (doc.registry as Record<string, unknown>) ?? doc
	const bps = toArray(reg.bad_practices as unknown[])
	const rules: Rule[] = []

	for (const bp of bps) {
		const entry = bp as Record<string, unknown>
		if (!entry || entry.mechanical !== true) continue
		const detect = toArray(entry.detect).map(safeRegExp).filter((r): r is RegExp => r != null)
		if (detect.length === 0) continue
		const skip = toArray(entry.detect_skip).map(safeRegExp).filter((r): r is RegExp => r != null)
		rules.push({
			id: String(entry.id ?? ''),
			rule: String(entry.rule || entry.name || entry.id || ''),
			skill,
			severity: mapSeverity(entry.severity),
			rawSeverity: String(entry.severity ?? ''),
			detect,
			skip,
			// scope: self — rule fires only on files routed to ITS OWN skill, never via a
			// neighbor's context_reads (e.g. entity's ".input() in entity schemas" must not
			// fire on event files, where .input() is the canon).
			scopeSelf: entry.scope === 'self',
		})
	}
	return rules
}

function readContextReads(path: string): string[] {
	const doc = loadRegistryDoc(path)
	const reg = (doc.registry as Record<string, unknown>) ?? doc
	return toArray(reg.context_reads as unknown[]).map(String)
}

/**
 * Every mechanical rule that governs a (skill, lang) pair, in evaluation order:
 * universal set first, then the skill's own registry, then one level of context_reads
 * (same lang). Skill rules are deduped by `<skill>::<id>`.
 */
export function loadMechanicalRules(skill: string, lang: Lang): Rule[] {
	const rules: Rule[] = [...loadUniversalRules()]
	const seen = new Set<string>()
	const push = (skillName: string, list: Rule[]) => {
		for (const r of list) {
			const key = `${skillName}::${r.id}`
			if (seen.has(key)) continue
			seen.add(key)
			rules.push(r)
		}
	}

	const primaryPath = resolveRegistryPath(skill, lang)
	push(skill, readMechanicalRules(primaryPath, skill))
	for (const ctxSkill of readContextReads(primaryPath)) {
		// scope:self rules never travel through context_reads (see readMechanicalRules).
		push(
			ctxSkill,
			readMechanicalRules(resolveRegistryPath(ctxSkill, lang), ctxSkill).filter(r => !r.scopeSelf),
		)
	}
	return rules
}

function ruleMatches(rule: Rule, text: string): boolean {
	if (!rule.detect.some(re => re.test(text))) return false
	if (rule.skip.length > 0 && rule.skip.some(re => re.test(text))) return false
	return true
}

/** Evaluate rules against a blob of text (whole-text detect + whole-text detect_skip). */
export function runRules(rules: Rule[], text: string): { id: string; rule: string; skill: string }[] {
	const findings: { id: string; rule: string; skill: string }[] = []
	for (const r of rules) {
		if (!ruleMatches(r, text)) continue
		findings.push({ id: r.id, rule: r.rule, skill: r.skill })
	}
	return findings
}

// ─── CLI (shared detector contract) ──────────────────────────────────

/**
 * Same scope the hook enforces: TS/TSX/Astro source, no generated/tests/stories/vendored.
 *
 * ### `*.typecheck.ts` / `*.type-test.ts` are TESTS, and the suffix is the only thing that hides it
 * A COMPILE-TIME assertion file is a test whose runner is `tsc` instead of `bun test`. It cannot be
 * named `*.test.ts`, because `tsconfig.build.json` excludes that suffix and the type-check — which IS
 * the assertion — would stop happening. So the file ends up outside the exclusion above for a purely
 * lexical reason, and the universal mechanical rules then read it as product code.
 *
 * That misreading is not hypothetical: `@ts-expect-error` is a universal `error` rule AND the
 * sanctioned assertion form in a type test (GOAL-agent-abstraction AC-6.7 says so in as many words,
 * scoping AC-3.4's ban to production). Without this line, writing the assertion the goal REQUIRES
 * grows the detector count, which AC-6.9 forbids — two ACs that cannot both be satisfied. Fixed here,
 * at the category error, rather than by parking the finding in the baseline as "known debt": it is not
 * debt, it is the assertion.
 *
 * ### The exclusion is anchored to a `tests/` directory, and that anchor is MEASURED
 * The suffix alone is too wide: `packages/app/react/src/storybook/connected.typecheck.ts` carries the
 * same suffix but lives in `src/`, ships with the app, and CARRIES A BASELINED FINDING
 * (`component#bp-22`) — a suffix-only rule would silently orphan that baseline key and remove a piece
 * of debt from the ratchet instead of paying it. Measured both ways against the same tree (948 files
 * in scope before this line): suffix-only → **944 scanned, 63 baselined** — one baseline key ORPHANED;
 * anchored to `tests/` → **945 scanned, 64 baselined**, i.e. exactly the three `tests/architecture`
 * files (`agent-input.type-test.ts` and `union-narrowing.typecheck.ts`, which produce zero findings
 * either way, plus `transport-stop-kind.typecheck.ts`) and nothing else.
 */
export function isInScope(file: string): boolean {
	if (!/\.(?:tsx?|astro)$/.test(file)) return false
	if (/\.(?:gen|test|spec|stories|d)\.(?:tsx?|astro)$/.test(file)) return false
	if (/(?:^|\/)tests?\/(?:.*\/)?[^/]*[.-](?:typecheck|type-test)\.tsx?$/.test(file)) return false
	if (/\/(?:node_modules|dist|sdk|generated|locales|\.claude)\//.test(file)) return false
	return true
}

const SKIP_DIRS = new Set(['node_modules', 'dist', 'sdk', 'generated', 'locales', '.claude', '.git'])

function collectDefaultFiles(): string[] {
	const out: string[] = []
	const walk = (dir: string) => {
		let entries: string[]
		try {
			entries = readdirSync(dir)
		} catch {
			return
		}
		for (const entry of entries) {
			if (SKIP_DIRS.has(entry)) continue
			const path = join(dir, entry)
			let stat
			try {
				stat = statSync(path)
			} catch {
				continue
			}
			if (stat.isDirectory()) walk(path)
			else if (isInScope(path)) out.push(path)
		}
	}
	walk(resolve(ROOT, 'packages'))
	return out
}

export function scanFile(absPath: string): Finding[] {
	let text: string
	try {
		text = readFileSync(absPath, 'utf8')
	} catch {
		return []
	}
	const match = matchSkill(absPath, loadComponentsIndex())
	const rules = match ? loadMechanicalRules(match.skill, detectLang(absPath)) : loadUniversalRules()

	const findings: Finding[] = []
	const lines = text.split('\n')
	for (const r of rules) {
		if (!ruleMatches(r, text)) continue
		// First line a detect hits; multi-line detects fall back to line 1, no excerpt.
		let line = 1
		let excerpt: string | undefined
		for (let i = 0; i < lines.length; i++) {
			if (r.detect.some(re => re.test(lines[i]))) {
				line = i + 1
				excerpt = lines[i].trim()
				break
			}
		}
		findings.push({
			detector: 'classify-edit',
			ruleId: r.id,
			source: `${r.skill}#${r.id}`,
			file: relative(ROOT, absPath),
			line,
			severity: r.severity,
			message: r.rule,
			excerpt,
		})
	}
	return findings
}

function main(argv: string[]): number {
	const json = argv.includes('--json')
	const all = argv.includes('--all')
	const fileArgs = argv.filter(a => !a.startsWith('--'))

	let targets: string[]
	if (all) targets = collectDefaultFiles()
	else if (fileArgs.length > 0) {
		const missing = fileArgs.filter(f => !existsSync(resolve(f)))
		if (missing.length > 0) {
			process.stderr.write(`no such file: ${missing.join(', ')}\n`)
			return 2
		}
		// Explicit args go through the same scope filter the hook enforces.
		targets = fileArgs.map(f => resolve(f)).filter(f => isInScope(relative(ROOT, f)))
	} else {
		process.stderr.write('usage: bun .claude/hooks/classify-edit-core.ts [--json] [--all] [files...]\n')
		return 0
	}

	const findings = targets.flatMap(scanFile)
	if (json) {
		process.stdout.write(`${JSON.stringify(findings, null, '\t')}\n`)
	} else {
		for (const f of findings) {
			process.stdout.write(`${f.file}:${f.line} ${f.severity} [${f.source}] ${f.message}\n`)
			if (f.excerpt) process.stdout.write(`\t> ${f.excerpt}\n`)
		}
		process.stdout.write(`${findings.length} finding(s) across ${targets.length} file(s)\n`)
	}
	return findings.some(f => f.severity === 'error') ? 1 : 0
}

if (import.meta.main) process.exit(main(process.argv.slice(2)))
