/**
 * Import-graph isolation test (whatscode AC-13, adapted to the Fork-D2 rewrite).
 *
 * Asserts that no source file OUTSIDE
 * `terminal/services/TerminalLLMRunner/ClaudeCliTerminalLLMRunner/` touches `Bun.Terminal` /
 * `new Terminal(` PTY primitives or references the `~/.claude/projects` / `.claude/projects`
 * transcript path strings. This keeps the brittle PTY + transcript-path coupling contained to a
 * single module boundary (the same invariant whatscode enforced for node-pty).
 *
 * Walks all non-test `.ts` files under `packages/api/typescript/src/`, skipping `node_modules`.
 *
 * Lives in `tests/architecture/` — the shared home for repo-wide mechanical detectors (the rail is
 * package-wide, not a property of the engine subtree it protects).
 */
import { describe, it, expect } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// `new Bun.Terminal` (construction) rather than the bare name — docstrings across the seam
// legitimately DESCRIBE the Fork-D2 engine; only real PTY construction is confined.
const FORBIDDEN_PTY_REFS = ['new Bun.Terminal', "from 'node-pty'"]
const FORBIDDEN_PATH_REFS = ['~/.claude/projects', ".claude', 'projects'"]

// Repo-wide rail home (tests/architecture) — re-rooted onto the package's src tree.
const SRC = join(import.meta.dir, '..', '..', 'src')
const ALLOWED_PREFIX = join(SRC, 'terminal/services/TerminalLLMRunner/ClaudeCliTerminalLLMRunner')

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

describe('Import-graph isolation — Bun.Terminal + ~/.claude/projects refs are confined', () => {
	const files = walk(SRC)

	for (const forbidden of FORBIDDEN_PTY_REFS) {
		it(`only files under ClaudeCliTerminalLLMRunner/ reference "${forbidden}"`, () => {
			const violators: string[] = []
			for (const f of files) {
				if (f.startsWith(ALLOWED_PREFIX)) continue
				const content = readFileSync(f, 'utf8')
				if (content.includes(forbidden)) violators.push(f)
			}
			expect(violators).toEqual([])
		})
	}

	for (const ref of FORBIDDEN_PATH_REFS) {
		it(`only files under ClaudeCliTerminalLLMRunner/ reference "${ref}"`, () => {
			const violators: string[] = []
			for (const f of files) {
				if (f.startsWith(ALLOWED_PREFIX)) continue
				const content = readFileSync(f, 'utf8')
				if (content.includes(ref)) violators.push(f)
			}
			expect(violators).toEqual([])
		})
	}
})
