#!/usr/bin/env bun
/**
 * go-enum-literals.ts — Go enum-boundary discipline walker.
 *
 * Go lacks TS's exhaustiveness checking, so the enum canon (enum/go skill) leans on
 * DISCIPLINE: every enum value flows through the typed constants in <ctx>/enums/ — never
 * re-typed string literals at SQL/scan/response boundaries. Measured k=2 on Sonnet
 * (go-consumer-iter1 enum#repr-at-scan-boundary + go-controller-iter1 enum#typed-usage).
 *
 * Self-deriving: member values are parsed from the enum definition files themselves
 * (`Name Type = "VALUE"` const blocks under packages/api/go/** /enums/*.go), so new enum
 * members are covered automatically. Every OTHER non-test .go file under internal/ that
 * contains one of those quoted values gates:
 *   GEL-01  quoted enum-member literal outside the enums package                error
 *
 * Legit exceptions: the enum definition files themselves, generated contracts bindings,
 * migrations (SQL files are not .go), and _test.go files (fixtures may inline values).
 *
 * Usage: bun scripts/detectors/go-enum-literals.ts [--json]
 * ROOT_OVERRIDE retargets the tree (eval worktrees). Baseline ratchet:
 * go-enum-literals.baseline.json — 29 pre-existing literals (mostly GOOGLE_ADS in the
 * google pipeline files) keyed file::line-agnostic; new findings gate. Burn-down ticketed.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'

export interface Finding {
	detector: string
	ruleId: string
	source: string
	file: string
	line: number
	severity: 'error'
	message: string
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = process.env.ROOT_OVERRIDE ? resolve(process.env.ROOT_OVERRIDE) : resolve(SCRIPT_DIR, '../..')
const GO_ROOT = join(PROJECT_ROOT, 'packages/api/go')

function rel(path: string): string {
	return relative(PROJECT_ROOT, path).replaceAll('\\', '/')
}

/** `<Member> <Type> = "<VALUE>"` lines inside enums/*.go — value → defining constant name. */
export async function collectEnumMembers(): Promise<Map<string, string>> {
	const members = new Map<string, string>()
	for await (const entry of new Bun.Glob('{core,internal}/**/enums/*.go').scan({ cwd: GO_ROOT, onlyFiles: true })) {
		if (entry.endsWith('_test.go')) continue
		const source = readFileSync(join(GO_ROOT, entry), 'utf-8')
		for (const m of source.matchAll(/^\t(\w+)\s+\w+\s*=\s*"([A-Z][A-Z0-9_]+)"/gm)) {
			members.set(m[2], m[1])
		}
	}
	return members
}

export async function walk(): Promise<Finding[]> {
	const findings: Finding[] = []
	// No Go bounded contexts in this tree (clean/stripped or non-Go) → nothing to gate.
	// (Bun.Glob('internal/**').scan on a missing dir throws ENOENT with a null-byte path,
	// which then poisons any downstream `claude -p` prompt that embeds the detect output.)
	if (!existsSync(join(GO_ROOT, 'internal'))) return findings
	const members = await collectEnumMembers()
	if (members.size === 0) return findings
	const valuePattern = new RegExp(`"(${[...members.keys()].join('|')})"`)

	for await (const entry of new Bun.Glob('internal/**/*.go').scan({ cwd: GO_ROOT, onlyFiles: true })) {
		if (entry.endsWith('_test.go') || /\/enums\//.test(entry) || /contracts|\.gen\.go$/.test(entry)) continue
		const file = join(GO_ROOT, entry)
		const source = readFileSync(file, 'utf-8')
		const lines = source.split('\n')
		for (let i = 0; i < lines.length; i++) {
			const hit = lines[i].match(valuePattern)
			if (!hit) continue
			findings.push({
				detector: 'go-enum-literals',
				ruleId: 'GEL-01',
				source: 'enum#go-boundary-discipline',
				file: rel(file),
				line: i + 1,
				severity: 'error',
				message: `re-typed enum literal "${hit[1]}" — use a typed constant — internal enums.${members.get(hit[1])} or the matching contracts wire constant for the field's declared type (Go has no exhaustiveness checking; constants are the only safety net).`,
			})
		}
	}
	return findings
}

const BASELINE_FILE = join(SCRIPT_DIR, 'go-enum-literals.baseline.json')

export function baselineKey(f: Finding): string {
	return `${f.file}::${f.message.split(' — ')[0]}`
}

if (import.meta.main) {
	const findings = await walk()
	if (process.argv.includes('--update-baseline')) {
		const keys = [...new Set(findings.map(baselineKey))].sort()
		writeFileSync(BASELINE_FILE, `${JSON.stringify(keys, null, '\t')}\n`)
		console.log(`baseline updated: ${keys.length} key(s)`)
		process.exit(0)
	}
	const baseline = new Set(existsSync(BASELINE_FILE) ? (JSON.parse(readFileSync(BASELINE_FILE, 'utf-8')) as string[]) : [])
	const gating = findings.filter(f => !baseline.has(baselineKey(f)))
	if (process.argv.includes('--json')) {
		console.log(JSON.stringify(findings, null, 2))
	} else {
		for (const f of gating) console.log(`${f.file}:${f.line} [${f.severity}] ${f.ruleId} (${f.source}) — ${f.message}`)
		console.log(`${findings.length} finding(s), ${gating.length} gating (${findings.length - gating.length} baselined)`)
	}
	process.exit(gating.length > 0 ? 1 : 0)
}
