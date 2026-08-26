#!/usr/bin/env bun
/**
 * PostToolUse edit-quality classifier (Write | Edit | MultiEdit) — REGISTRY-DRIVEN.
 *
 * Thin hook adapter over classify-edit-core.ts. The core owns the rule engine
 * (detectLang, glob matching, registry routing, mechanical-rule loading, matching);
 * this file owns only the hook envelope: stdin parse, file scope filter,
 * additionalContext emission, reentrancy guard, and crash safety.
 *
 *   file → detectLang(path) → registry.yaml component match → skill
 *        → resolveRegistryPath(skill, lang) (+ context_reads, + universal set)
 *        → mechanical bad_practices' `detect` (minus `detect_skip`) vs the new text
 *
 * The registries are the single source of truth: add a `mechanical: true` rule with a `detect`
 * regex to any skill's registry.yaml and this hook enforces it automatically — no edit here.
 * The universal cast/suppression set is data too: .claude/registry.yaml → cc-bp-04.
 *
 * Robustness: reentrancy-guarded, and EVERYTHING is wrapped in try/catch. A hook crash must
 * NEVER block an edit — any error path silently exits 0.
 */
import { readFileSync } from 'node:fs'
import { relative } from 'node:path'

// The core is imported DYNAMICALLY inside the crash guard below: it pulls scripts/lib/repo-model →
// template.config.ts + the 'yaml' package, and on a fresh clone BEFORE `bun install` that import
// throws. A hook fires on the very first edit — an import-time crash would block every edit, so
// import failure must hit the same silent-exit-0 path as any runtime error.
type Core = typeof import('./classify-edit-core')

function run(core: Core): string | null {
	const { ROOT, detectLang, loadComponentsIndex, loadMechanicalRules, loadUniversalRules, matchSkill, runRules } = core
	let payload: { tool_name?: string; tool_input?: Record<string, unknown> }
	try {
		payload = JSON.parse(readFileSync(0, 'utf8'))
	} catch {
		return null
	}

	const tool = payload.tool_name ?? ''
	const input = payload.tool_input ?? {}
	const file = String(input.file_path ?? '')

	// Scope: TS/TSX/Astro source. Skip generated / tests / stories / locales / vendored / hook dirs.
	// Tested against the path RELATIVE to ROOT — the absolute path can itself embed one of these
	// segments (e.g. a worktree living under `.claude/worktrees/<name>/`), which would otherwise
	// make every file in that worktree match `\.claude\` and get silently skipped.
	if (!/\.(?:tsx?|astro)$/.test(file)) return null
	if (/\.(?:gen|test|spec|stories|d)\.(?:tsx?|astro)$/.test(file)) return null
	const relPath = relative(ROOT, file)
	if (/(?:^|\/)(?:node_modules|dist|sdk|generated|locales|\.claude)\//.test(relPath)) return null

	// The NEW text this edit introduces.
	let text = ''
	if (tool === 'Write') text = String(input.content ?? '')
	else if (tool === 'Edit') text = String(input.new_string ?? '')
	else if (tool === 'MultiEdit') text = ((input.edits as { new_string?: string }[]) ?? []).map(e => String(e?.new_string ?? '')).join('\n')
	else return null
	if (!text.trim()) return null

	// ── Route file → skill via the global registry, collect mechanical rules ──
	const match = matchSkill(file, loadComponentsIndex())
	const rules = match ? loadMechanicalRules(match.skill, detectLang(file)) : loadUniversalRules()

	// ── Evaluate every rule against the new text ──
	const findings: string[] = []
	for (const r of runRules(rules, text)) {
		const line = `• [${r.id}] ${r.rule}`
		if (!findings.includes(line)) findings.push(line)
	}
	if (findings.length === 0) return null

	const rel = file.split('/src/').pop() ?? file
	return JSON.stringify({
		hookSpecificOutput: {
			hookEventName: 'PostToolUse',
			additionalContext: `⚠️ EDIT-QUALITY — ${rel} matches registry bad-practices:\n${findings.join('\n')}\nFix the cause; do not cast/widen/suppress/fork-schema to dodge it.`,
		},
	})
}

// Reentrancy guard — keep even though this revision shells out to nothing.
if (process.env.CLASSIFY_EDIT_RUNNING !== '1') {
	try {
		const core = await import('./classify-edit-core')
		const out = run(core)
		if (out) process.stdout.write(out)
	} catch {
		/* A hook crash must NEVER block an edit — including an import-time crash pre-install. */
	}
}
process.exit(0)
