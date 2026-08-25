/**
 * Import-graph isolation test (whatscode AC-13, adapted to the Fork-D2 rewrite, then to the
 * agent-abstraction rewrite that deleted the PTY engine entirely).
 *
 * THREE families of literal are confined here, and they do NOT share one allowed-set:
 *
 *  1. `FORBIDDEN_PTY_REFS`  — PTY construction (`new Bun.Terminal`, `from 'node-pty'`).
 *  2. `FORBIDDEN_PATH_REFS` — the `~/.claude/projects` transcript-path strings.
 *  3. `FORBIDDEN_SPAWN_REFS` — `node:child_process` imports.
 *
 * (1) and (2) are the FOSSIL families: the engine that used them is gone (GOAL-agent-abstraction §5.3
 * — `ClaudeCliTerminalLLMRunner/**` deleted in Fase 3), so their allowed prefix now points at the
 * runner that replaced it and the expected violator count is ZERO everywhere, INCLUDING there. Keeping
 * the rail after the deletion is the point: it is what stops a future "just tail the transcript file"
 * shortcut from re-growing the coupling this rewrite removed.
 *
 * (3) is the LIVE family, and it is the half this rail did not have before. Spawn is a broader
 * capability than PTY, and exactly TWO modules legitimately create a process — which is the invariant
 * in one sentence: **a provider CLI is spawned only by the module that DETECTS the binary and the
 * module that EXECUTES the turn.** Any third file importing `node:child_process` is a violation.
 * `ProviderDetector` is in the allowed set rather than exempted by filename because §5.3 keeps it and
 * Fase 1 EXTENDS it to probe `helpArgs` × `capabilityFlags` — it must spawn, and it spawns BEFORE any
 * run exists. Moving it under `services/AgentRunner/` would invert the dependency (the runner would
 * contain the detection that precedes it); a per-file exception would fossilize at the first rename.
 *
 * Walks all non-test `.ts` files under `packages/api/typescript/src/`, skipping `node_modules`.
 *
 * Lives in `tests/architecture/` — the shared home for repo-wide mechanical detectors (the rail is
 * package-wide, not a property of the subtree it protects). There is exactly ONE such file: a parallel
 * `ImportGraphIsolation.test.ts` would be a duplicated rail with two truths.
 */
import { describe, it, expect } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'

// `new Bun.Terminal` (construction) rather than the bare name — docstrings across the seam
// legitimately DESCRIBE the deleted Fork-D2 engine; only real PTY construction is confined.
const FORBIDDEN_PTY_REFS = ['new Bun.Terminal', "from 'node-pty'"]
const FORBIDDEN_PATH_REFS = ['~/.claude/projects', ".claude', 'projects'"]
// The import form, not the module name in prose: a comment explaining WHY a file must not spawn is
// legitimate and has to stay writable.
const FORBIDDEN_SPAWN_REFS = ["from 'node:child_process'", "require('node:child_process')"]

// Repo-wide rail home (tests/architecture) — re-rooted onto the package's src tree.
const SRC = join(import.meta.dir, '..', '..', 'src')

// ── The path constants, all together: Fase 5 swapped `terminal/` for `agent/` in THIS BLOCK and
// nowhere else (AC-5.9). The `git mv terminal → agent` already landed in Fase 5, so they read
// `agent/` below, not `terminal/`.
// DIRECTORY prefixes — the trailing separator is load-bearing. A bare `startsWith` on
// `…/services/AgentRunner` also matches `…/services/AgentRunnerFactory`, so the sibling that resolves
// `ProviderKind` → runner would have silently INHERITED the spawn permission it must not have. The
// hole is not hypothetical: that sibling exists (see `services/AgentRunnerFactory/index.ts`).
const ALLOWED_PREFIX = join(SRC, 'agent/services/AgentRunner') + sep
// Spawn is a wider capability than PTY: TWO modules legitimately create a process.
const ALLOWED_SPAWN_PREFIXES = [
	join(SRC, 'agent/services/AgentRunner') + sep, // Fase 5 (AC-5.9): 'agent/services/AgentRunner'
	join(SRC, 'agent/services/ProviderDetector') + sep, // Fase 5 (AC-5.9): 'agent/services/ProviderDetector'
]

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry)
		const st = statSync(full)
		if (st.isDirectory()) {
			if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === '__fixtures__') continue
			walk(full, out)
		} else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
			out.push(full)
		}
	}
	return out
}

function violators(files: string[], forbidden: string, allowed: string[]): string[] {
	const found: string[] = []
	for (const f of files) {
		if (allowed.some(prefix => f.startsWith(prefix))) continue
		if (readFileSync(f, 'utf8').includes(forbidden)) found.push(f)
	}
	return found
}

describe('Import-graph isolation — PTY, transcript paths and process spawn are confined', () => {
	const files = walk(SRC)

	for (const forbidden of [...FORBIDDEN_PTY_REFS, ...FORBIDDEN_PATH_REFS]) {
		it(`only files under AgentRunner/ reference "${forbidden}"`, () => {
			expect(violators(files, forbidden, [ALLOWED_PREFIX])).toEqual([])
		})
	}

	for (const forbidden of FORBIDDEN_SPAWN_REFS) {
		it(`only AgentRunner/ and ProviderDetector/ reference "${forbidden}"`, () => {
			expect(violators(files, forbidden, ALLOWED_SPAWN_PREFIXES)).toEqual([])
		})
	}

	it('the PTY engine is GONE, not merely quarantined — even the allowed prefix has zero PTY refs', () => {
		const inside = files.filter(f => f.startsWith(ALLOWED_PREFIX))
		expect(inside.length).toBeGreaterThan(0)
		const offenders = inside.filter(f => {
			const content = readFileSync(f, 'utf8')
			return [...FORBIDDEN_PTY_REFS, ...FORBIDDEN_PATH_REFS].some(ref => content.includes(ref))
		})
		expect(offenders).toEqual([])
	})
})
