#!/usr/bin/env bun
/**
 * registry-scan.ts — repo-wide batch scan of skill-registry mechanical rules.
 *
 * Engine: .claude/hooks/classify-edit-core.ts (skill routing, registry loading,
 * rule matching) — imported, not reimplemented. Unlike the PostToolUse hook
 * (which sees only the edited text), this runs every rule against FULL file content.
 *
 * Usage:
 *   bun scripts/detectors/registry-scan.ts                 # default glob (git ls-files under packages/)
 *   bun scripts/detectors/registry-scan.ts --all           # same as default
 *   bun scripts/detectors/registry-scan.ts [--json] f1 f2  # specific files
 *   bun scripts/detectors/registry-scan.ts --rules         # compiled rule inventory (skill, id, regex count)
 *   bun scripts/detectors/registry-scan.ts --update-baseline  # snapshot current findings as known debt
 *   bun scripts/detectors/registry-scan.ts --no-baseline   # report everything, ignore the baseline
 *
 * Baseline (ratchet): registry-scan.baseline.json next to this script holds "file::source"
 * keys of pre-existing findings. When present it is applied by default — only NEW findings
 * fail the gate; fixing debt then running --update-baseline ratchets the file down.
 *
 * Exit 1 iff any severity 'error' finding (after baseline subtraction).
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
	type Finding,
	type Lang,
	ROOT,
	type Rule,
	detectLang,
	isInScope,
	loadComponentsIndex,
	loadMechanicalRules,
	loadUniversalRules,
	matchSkill,
	runRules,
} from '../../.claude/hooks/classify-edit-core'
import { LANGS as REPO_LANGS } from '../lib/repo-model'

export type { Finding }

// ROOT_OVERRIDE (env) retargets file DISCOVERY + READING (eval worktrees — scripts/skill-evals/);
// rule/registry loading stays pinned to the engine's ROOT (this repo's .claude tree). Unset → identical behavior.
const SCAN_ROOT = process.env.ROOT_OVERRIDE ? resolve(process.env.ROOT_OVERRIDE) : ROOT

// ─── Severity mapping (detector contract) ───────────────────────────
// Registry raw severity: critical→error, moderate/high→warning, else info.
// `error` is aliased to critical (a registry author writing `severity: error` means error);
// no mechanical rule uses it at HEAD, so the alias is dormant.

function mapScanSeverity(rule: Rule): Finding['severity'] {
	const raw = rule.rawSeverity
	if (raw == null) return rule.severity
	if (raw === 'critical' || raw === 'error') return 'error'
	if (raw === 'info' || raw === 'note') return 'info'
	// moderate/high/medium/low/major/minor/warning — same collapse the hook applies,
	// so scanner and edit-hook never disagree on a rule's severity tier.
	return 'warning'
}

// ─── Per-file scan (content-based — tests feed fixture strings) ─────

/**
 * O mesmo texto com todo COMENTÁRIO substituído por espaços — posições e números de linha
 * preservados, para o `line`/`excerpt` do achado continuarem apontando o lugar certo.
 *
 * Existe porque comentário não é código: em 2026-08-07 o redesign documentou as cores MEDIDAS na
 * referência ("mapeia `#3D660A` para o token X") e o detector de cor hard-coded acusou os próprios
 * comentários que explicavam a decisão — punindo justamente a documentação que queremos. Só o que o
 * navegador executa conta.
 */
function withoutComments(content: string): string {
	return content
		.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
		.replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length))
}

export function scanContent(file: string, content: string): Finding[] {
	const rel = isAbsolute(file) ? relative(SCAN_ROOT, file) : file
	const match = matchSkill(rel, loadComponentsIndex())
	const rules = match ? loadMechanicalRules(match.skill, detectLang(rel)) : loadUniversalRules()

	// runRules is the engine's matcher (whole-text detect minus whole-text detect_skip);
	// join its hits back to the Rule objects for severity + line/excerpt emission.
	const code = withoutComments(content)
	const matched = new Set(runRules(rules, code).map(m => `${m.skill}::${m.id}`))
	if (matched.size === 0) return []

	const findings: Finding[] = []
	const lines = code.split('\n')
	const seen = new Set<string>()
	for (const r of rules) {
		const key = `${r.skill}::${r.id}`
		if (!matched.has(key) || seen.has(key)) continue
		seen.add(key)
		// First line a detect hits; whole-text-only matches fall back to line 1, no excerpt.
		let line = 1
		let excerpt: string | undefined
		for (let i = 0; i < lines.length; i++) {
			if (r.detect.some(re => re.test(lines[i]))) {
				line = i + 1
				excerpt = lines[i].trim().slice(0, 200)
				break
			}
		}
		findings.push({
			detector: 'registry-scan',
			ruleId: r.id,
			source: `${r.skill}#${r.id}`,
			file: rel,
			line,
			severity: mapScanSeverity(r),
			message: r.rule,
			excerpt,
		})
	}
	return findings
}

// ─── Rule inventory (--rules) ───────────────────────────────────────

// The lang universe comes from the workspace table — never a local list (F1a.4).
const LANGS: readonly Lang[] = REPO_LANGS

export function ruleInventory(): { skill: string; id: string; regexCount: number }[] {
	const components = loadComponentsIndex()
	const skills = new Set<string>()
	for (const [artifact, def] of Object.entries(components)) skills.add(def?.skill ?? artifact)

	// Dedupe by skill::id; lang variants reuse ids — keep the largest detect set.
	const rows = new Map<string, { skill: string; id: string; regexCount: number }>()
	for (const skill of skills) {
		for (const lang of LANGS) {
			for (const r of loadMechanicalRules(skill, lang)) {
				const key = `${r.skill}::${r.id}`
				const prev = rows.get(key)
				if (!prev || r.detect.length > prev.regexCount) {
					rows.set(key, { skill: r.skill, id: r.id, regexCount: r.detect.length })
				}
			}
		}
	}
	return [...rows.values()].sort((a, b) => a.skill.localeCompare(b.skill) || a.id.localeCompare(b.id))
}

// ─── File discovery ─────────────────────────────────────────────────

/**
 * git ls-files under packages/ filtered through the engine's scope rules.
 * maxBuffer is bumped to 64 MiB — the tracked file list can exceed the 1 MiB default
 * (large committed trees have hit ~22k paths historically), and the default silently
 * ENOBUFS-crashes the whole `bun detect` gate.
 */
export function defaultTargets(): string[] {
	return execSync('git ls-files -- packages', { cwd: SCAN_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
		.split('\n')
		.filter(Boolean)
		.filter(isInScope)
}

function toRepoRelative(arg: string): string {
	const abs = isAbsolute(arg) ? arg : resolve(process.cwd(), arg)
	return existsSync(abs) ? relative(SCAN_ROOT, abs) : arg
}

// ─── Baseline (ratchet) ─────────────────────────────────────────────

const BASELINE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), 'registry-scan.baseline.json')

export function baselineKey(f: Finding): string {
	return `${f.file}::${f.source}`
}

export function applyBaseline(findings: Finding[], keys: Set<string>): { fresh: Finding[]; baselined: number } {
	const fresh = findings.filter(f => !keys.has(baselineKey(f)))
	return { fresh, baselined: findings.length - fresh.length }
}

function loadBaseline(): Set<string> {
	if (!existsSync(BASELINE_PATH)) return new Set()
	return new Set(JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as string[])
}

// ─── CLI ────────────────────────────────────────────────────────────

function main(argv: string[]): number {
	const json = argv.includes('--json')
	const fileArgs = argv.filter(a => !a.startsWith('--'))

	if (argv.includes('--rules')) {
		const inventory = ruleInventory()
		if (json) {
			console.log(JSON.stringify(inventory, null, '\t'))
		} else {
			for (const row of inventory) console.log(`${row.skill}#${row.id}\t${row.regexCount} regex(es)`)
			console.log(`\n${inventory.length} compiled mechanical rule(s)`)
		}
		return 0
	}

	// `--all` and the bare default are the same full glob; file args override both.
	const targets = fileArgs.length > 0 ? fileArgs.map(toRepoRelative) : defaultTargets()
	if (fileArgs.length > 0) {
		const missing = targets.filter(f => !existsSync(resolve(SCAN_ROOT, f)))
		if (missing.length > 0) {
			console.error(`no such file: ${missing.join(', ')}`)
			return 2
		}
	}

	const all: Finding[] = []
	let scanned = 0
	for (const file of targets) {
		const abs = resolve(SCAN_ROOT, file)
		if (!existsSync(abs) || !statSync(abs).isFile()) continue
		scanned++
		all.push(...scanContent(relative(SCAN_ROOT, abs), readFileSync(abs, 'utf8')))
	}

	if (argv.includes('--update-baseline')) {
		const keys = [...new Set(all.map(baselineKey))].sort()
		writeFileSync(BASELINE_PATH, `${JSON.stringify(keys, null, '\t')}\n`)
		console.log(`baseline updated: ${keys.length} key(s) → ${relative(ROOT, BASELINE_PATH)}`)
		return 0
	}

	// File-scoped runs only baseline against the scanned files' own keys, so partial runs
	// (lint-staged) behave identically to --all for the files they cover.
	const useBaseline = !argv.includes('--no-baseline')
	const { fresh: findings, baselined } = useBaseline ? applyBaseline(all, loadBaseline()) : { fresh: all, baselined: 0 }

	const errors = findings.filter(f => f.severity === 'error').length
	if (json) {
		console.log(JSON.stringify(findings, null, '\t'))
	} else {
		for (const f of findings) {
			console.log(`${f.file}:${f.line} [${f.severity}] ${f.source} — ${f.message}`)
			if (f.excerpt) console.log(`    ${f.excerpt}`)
		}
		const suffix = baselined > 0 ? `, ${baselined} baselined (known debt — ratchet via --update-baseline)` : ''
		console.log(`\n${findings.length} finding(s) (${errors} error)${suffix}, ${scanned} file(s) scanned`)
	}
	return errors > 0 ? 1 : 0
}

if (import.meta.main) process.exit(main(process.argv.slice(2)))
