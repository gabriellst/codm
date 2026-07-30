#!/usr/bin/env bun
/**
 * rebrand-codm.ts — the ONE-SHOT codemod that moves this fork's identity from `codedm` to `codm`.
 * Plan: `.plans/2026-07-30-a-renames-codm.md` (frente A, T3 births it; T7 DELETES it).
 *
 * WHY A SCRIPT AND NOT sed. Not because substituting a string is hard — because knowing where NOT
 * to substitute is. A blind `codedm → codm` over the tree rewrites `.specs/codedm/…` inside
 * production docblocks into `.specs/codm/…`, a path that does not exist, in the very comments that
 * exist to point a reader at the spec that justified the code. It also rewrites `.plans/` and
 * `.specs/` themselves — falsifying a signed, dated record of what the founder decided.
 *
 * WHY FOUR PASSES AND NOT ONE `--all`. Determinism comes from the tables below, not from running
 * them in one shot. A single ~2400-substitution commit leaves no gate able to name which surface
 * broke. Each pass is one task, one commit, and one gate that knows how to fail it:
 *
 *   scope → `@codedm/` + the 12 package `name`s   gate: bun install + bun tsc + bun run test
 *   brand → the 5 Rust crates + Tauri identity    gate: bun desktop:generate --check + cargo build
 *   env   → CODEDM_* + the data dir + codedm.db   gate: env-model.test.ts (ENV-01..04) + go test
 *   text  → prose, MCP key, cookie, the residue   gate: git grep -i codedm == whitelist
 *
 * THE PASSES ARE AN ORDERED PIPELINE. `text` ends in a catch-all, so running it early would
 * silently absorb the other three and make their gates vacuous. `--dry-run` / `--check` therefore
 * simulate the earlier passes in memory before reporting the one you asked for: the number you get
 * is what THAT pass will do when its turn comes, whatever the tree looks like today.
 *
 * Usage:
 *   bun scripts/rebrand-codm.ts --dry-run --pass=scope            # inventory, writes nothing
 *   bun scripts/rebrand-codm.ts --dry-run --pass=text --falsify-whitelist   # cost of the whitelist
 *   bun scripts/rebrand-codm.ts --pass=scope                      # apply
 *   bun scripts/rebrand-codm.ts --check --pass=scope              # exit 1 if work remains
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO } from '../template.config'

const ROOT = resolve(import.meta.dirname, '..')

export type Pass = 'scope' | 'brand' | 'env' | 'text'
/** Declared ORDER, not just a set: `text` ends in a catch-all and must run last. */
export const PASSES = ['scope', 'brand', 'env', 'text'] as const satisfies readonly Pass[]

/** A literal substitution. `only` pins a rule to ONE file — see the `@codedm` mention-tag note. */
export interface Rule {
	readonly from: string
	readonly to: string
	readonly only?: string
}

export const RULES: Readonly<Record<Pass, readonly Rule[]>> = {
	// 75% of the whole rebrand, and the least judgment: an npm specifier is an npm specifier.
	scope: [
		{ from: '@codedm/', to: '@codm/' },
		// The repo-identity const, FILE-PINNED on purpose. A bare `@codedm` (no slash) is the MENTION
		// TAG everywhere else — `MentionGate.test.ts` asserts `mintMentionTag('/…/pessoal/codedm')`
		// is `'@codedm'`, derived from the folder name, not from the scope. Rewriting that here, while
		// the folder and `FALLBACK_TAG` stay put, turns a live rail red in the middle of the rebrand.
		// The tag moves in `text`, together with `FALLBACK_TAG` (plan D-G).
		{ from: `'@codedm'`, to: `'@codm'`, only: 'template.config.ts' },
	],
	// `template.config.ts:38` declares `rust: { cratePrefix: brand }` and
	// `packages/app/tauri/config/generate.ts` already CHECKS the Cargo names against `REPO.brand` —
	// so the crates, the sidecar binaries and the Tauri identifier are one indivisible move.
	brand: [
		{ from: 'codedm-client-rust', to: 'codm-client-rust' },
		{ from: 'codedm_client_rust', to: 'codm_client_rust' },
		{ from: 'codedm-contracts-rust', to: 'codm-contracts-rust' },
		{ from: 'codedm_contracts_rust', to: 'codm_contracts_rust' },
		{ from: 'codedm-desktop', to: 'codm-desktop' },
		{ from: 'codedm_desktop_lib', to: 'codm_desktop_lib' },
		{ from: 'codedm-daemon', to: 'codm-daemon' },
		{ from: 'codedm-gateway', to: 'codm-gateway' },
		{ from: 'app.codedm.desktop', to: 'app.codm.desktop' },
		{ from: 'codedm-plans', to: 'codm-plans' },
		{ from: 'codedm-e2e-data-', to: 'codm-e2e-data-' },
	],
	// ENV-01..04 tie the Zod schema, the registry, `.env.example` and `config.go` together, so the
	// key prefix, the data dir and the SQLite FILE NAME cannot move independently.
	env: [
		{ from: 'CODEDM_', to: 'CODM_' },
		{ from: '~/.codedm', to: '~/.codm' },
		{ from: '.codedm/data', to: '.codm/data' },
		{ from: 'codedm.db', to: 'codm.db' },
	],
	// The residue — and the only pass with a catch-all, which is why it runs last.
	text: [
		{ from: 'CodeDM', to: 'CODM' },
		// The 4th casing in HEAD (`isCodedmTool`, 4 occurrences) — identifier case, so `Codm`, not
		// `CODM`: `isCODMTool` is not a name anyone would write.
		{ from: 'Codedm', to: 'Codm' },
		// Dead once `env` has run; declared so AC-10 (case-INSENSITIVE zero) is closable by the table
		// rather than by the accident that every upper-case occurrence in HEAD carries an underscore.
		{ from: 'CODEDM', to: 'CODM' },
		{ from: 'codedm_locale', to: 'codm_locale' },
		{ from: 'github.com/codedm', to: 'github.com/codm' },
		{ from: 'codedm', to: 'codm' },
	],
}

// ── the whitelist (plan D-D) — six declared rules, in precedence order ────────────────────────

/** Rule 1 + 4 + 5 + 7: trees and files the codemod never opens. */
const OUT_OF_UNIVERSE_PREFIXES = [
	// Rule 1 — history. `.specs/codedm/GOAL-agent-abstraction.md` records what the founder decided
	// on 23-jul; rewriting it is documentary fraud. Covers the canonical rust-wire spec too.
	'.plans/',
	'.specs/',
	// Rule 4 — dated handoffs are the same kind of object (OQ-1: whitelist confirmed).
	'docs/handoff/',
] as const

const OUT_OF_UNIVERSE_FILES = new Set([
	// Rule 5 — regenerated by `bun install` in T4, never hand-edited.
	'bun.lock',
	// Rule 7 — the codemod carries the tables above IN ITS SOURCE. Rewriting itself would corrupt
	// every later pass and make `--check` report 0 for a reason unrelated to the repo.
	'scripts/rebrand-codm.ts',
	'scripts/rebrand-codm.test.ts',
])

/** Rule 4, root handoffs: `HANDOFF.md`, `HANDOFF-2026-07-23-ORG.md`. */
const HANDOFF_FILE = /^HANDOFF[^/]*\.md$/

/**
 * Rule 2 — a LINE citing a historical path is preserved byte-for-byte, in ANY file, including a
 * production one that changes on the line above. 14 lines across 11 files in HEAD (docblocks in
 * ClaudeAgentRunner.ts / AgentFrame.ts / wire_identity_test.go, and `.gitignore:72,77`, where a
 * rewrite would silently change WHICH files are versioned).
 */
const HISTORICAL_CITATION = /\.specs\/codedm|\.plans\//

/** Rule 6: only what `git ls-files` lists — no node_modules/, target/, .claude/audit/, worktrees. */
export function isOutOfUniverse(path: string): boolean {
	if (OUT_OF_UNIVERSE_FILES.has(path)) return true
	if (HANDOFF_FILE.test(path)) return true
	return OUT_OF_UNIVERSE_PREFIXES.some(prefix => path.startsWith(prefix))
}

export interface RewriteResult {
	readonly text: string
	readonly count: number
	/** Substitutions per rule `from`, for the dry-run inventory. */
	readonly byForm: Readonly<Record<string, number>>
}

/**
 * The whole judgment of this codemod, as a pure function of (path, content, pass).
 * `opts.falsifyWhitelist` disables rules 1/2/4/5/7 — the measurement that puts a NUMBER on what the
 * whitelist costs. It is refused outside `--dry-run` at the CLI boundary.
 */
export function rewriteContent(path: string, text: string, pass: Pass, opts: { falsifyWhitelist?: boolean } = {}): RewriteResult {
	const byForm: Record<string, number> = {}
	const guarded = opts.falsifyWhitelist !== true

	if (guarded && isOutOfUniverse(path)) return { text, count: 0, byForm }
	// `git ls-files` lists .png/.ico/.woff too; a byte-wise replace over one corrupts it silently.
	if (text.includes('\u0000')) return { text, count: 0, byForm }

	const rules = RULES[pass].filter(rule => rule.only === undefined || rule.only === path)
	let count = 0
	const out = text
		.split('\n')
		.map(line => {
			if (guarded && HISTORICAL_CITATION.test(line)) return line
			let current = line
			for (const rule of rules) {
				const hits = current.split(rule.from).length - 1
				if (hits === 0) continue
				current = current.split(rule.from).join(rule.to)
				count += hits
				byForm[rule.from] = (byForm[rule.from] ?? 0) + hits
			}
			return current
		})
		.join('\n')

	return { text: out, count, byForm }
}

// ── territories (for the inventory) — derived from the workspace table, never a literal list ──

const WORKSPACE_ROOTS = Object.values(REPO.workspaces)
	.map(w => w.pkgRoot)
	.sort((a, b) => b.length - a.length)

export function territoryOf(path: string): string {
	const workspace = WORKSPACE_ROOTS.find(root => path.startsWith(`${root}/`))
	if (workspace !== undefined) return workspace
	const segments = path.split('/')
	if (segments.length === 1) return '(root)'
	// A `packages/**` path outside every declared workspace still deserves its own bucket.
	return segments.slice(0, path.startsWith('packages/') ? 3 : 1).join('/')
}

// ── walker + CLI ──────────────────────────────────────────────────────────────────────────────

function trackedFiles(): string[] {
	return execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 })
		.toString()
		.split('\0')
		.filter(p => p.length > 0)
}

function read(path: string): string | null {
	try {
		return readFileSync(resolve(ROOT, path), 'utf8')
	} catch {
		return null
	}
}

interface Report {
	total: number
	files: number
	byForm: Record<string, number>
	byTerritory: Record<string, number>
}

/**
 * Simulates the pipeline up to `pass` and reports what `pass` ITSELF would substitute. Earlier
 * passes are applied in memory only — so the number is stable whether or not they already landed.
 */
function survey(pass: Pass, opts: { falsifyWhitelist?: boolean }): Report {
	const upTo = PASSES.indexOf(pass)
	const report: Report = { total: 0, files: 0, byForm: {}, byTerritory: {} }

	for (const path of trackedFiles()) {
		if (opts.falsifyWhitelist !== true && isOutOfUniverse(path)) continue
		const original = read(path)
		if (original === null) continue

		let content = original
		for (let i = 0; i < upTo; i++) content = rewriteContent(path, content, PASSES[i] as Pass, opts).text
		const result = rewriteContent(path, content, pass, opts)
		if (result.count === 0) continue

		report.total += result.count
		report.files += 1
		report.byTerritory[territoryOf(path)] = (report.byTerritory[territoryOf(path)] ?? 0) + result.count
		for (const [form, hits] of Object.entries(result.byForm)) report.byForm[form] = (report.byForm[form] ?? 0) + hits
	}
	return report
}

/** Applies `pass` to the tree as it stands. Passes must be run in PASSES order. */
function apply(pass: Pass): Report {
	const report: Report = { total: 0, files: 0, byForm: {}, byTerritory: {} }
	for (const path of trackedFiles()) {
		if (isOutOfUniverse(path)) continue
		const original = read(path)
		if (original === null) continue
		const result = rewriteContent(path, original, pass)
		if (result.count === 0) continue
		writeFileSync(resolve(ROOT, path), result.text)
		report.total += result.count
		report.files += 1
		report.byTerritory[territoryOf(path)] = (report.byTerritory[territoryOf(path)] ?? 0) + result.count
		for (const [form, hits] of Object.entries(result.byForm)) report.byForm[form] = (report.byForm[form] ?? 0) + hits
	}
	return report
}

function printReport(pass: Pass, report: Report, label: string): void {
	console.log(`\n[${pass}] ${label}: ${report.total} substitutions across ${report.files} files`)
	if (report.total === 0) return
	console.log('  by form:')
	for (const rule of RULES[pass]) {
		const hits = report.byForm[rule.from]
		if (hits !== undefined) console.log(`    ${rule.from.padEnd(24)} → ${rule.to.padEnd(24)} ${String(hits).padStart(5)}`)
	}
	console.log('  by territory:')
	for (const [territory, hits] of Object.entries(report.byTerritory).sort((a, b) => b[1] - a[1])) {
		console.log(`    ${territory.padEnd(34)} ${String(hits).padStart(5)}`)
	}
}

function main(): void {
	const argv = process.argv.slice(2)
	const dryRun = argv.includes('--dry-run')
	const check = argv.includes('--check')
	const falsifyWhitelist = argv.includes('--falsify-whitelist')
	const passArg = argv.find(a => a.startsWith('--pass='))?.slice('--pass='.length)

	if (passArg === undefined || !(PASSES as readonly string[]).includes(passArg)) {
		console.error(`✗ --pass=<${PASSES.join('|')}> is required`)
		process.exit(1)
	}
	const pass = passArg as Pass

	// The falsifier measures the whitelist; it must never be able to erase it from disk.
	if (falsifyWhitelist && !dryRun) {
		console.error('✗ --falsify-whitelist is a MEASUREMENT — it is only accepted together with --dry-run')
		process.exit(1)
	}

	if (dryRun || check) {
		const report = survey(pass, { falsifyWhitelist })
		printReport(pass, report, falsifyWhitelist ? 'dry-run WITHOUT the whitelist' : 'dry-run')
		if (check) {
			if (report.total === 0) {
				console.log(`\n✔ pass '${pass}' has nothing left to do`)
				return
			}
			console.error(`\n✗ pass '${pass}' still has ${report.total} substitutions pending`)
			process.exit(1)
		}
		return
	}

	printReport(pass, apply(pass), 'applied')
}

if (import.meta.main) main()
