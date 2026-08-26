import { describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

/**
 * core-TS's own genericity rail — the TS twin of `core/vocabulary_test.go` (spec T11 AC-1 /
 * upstream-prep Decision 4, T8): `@codm/core-typescript` must stay reusable by ANY TS service of
 * ANY fork, so no file under this package may name THIS fork's own vocabulary — not even in a
 * comment, which is exactly where the Go audit found it hiding first.
 *
 * FORBIDDEN: the bare word "codm", in any casing, standalone — "codm.db", "the codm SQLite
 * store", a bare "CODM" in prose, "codm-sqlite-", etc.
 *
 * THREE DELIBERATE, NARROW EXEMPTIONS (never a blanket allowlist):
 *   1. `@codm/...` — this package's own workspace scope (package.json `name`, and every sibling
 *      workspace package: `@codm/contracts`, `@codm/contracts-typescript`, `@codm/client-typescript`,
 *      `@codm/api-typescript`, ...). Renaming the ACTUAL npm scope is a template-donation-time
 *      concern (spec Decision 8/AC-4), not this rail's job — and every package in this monorepo
 *      uses it, so flagging it here would be a repo-wide false-positive flood, not a genuine leak.
 *      Matched by "immediately preceded by @" — never fires on "codm" used as a bare word.
 *   2. `CODM_XXX`-shaped tokens (env-var names continuing past the boundary: `CODM_DATA_DIR`,
 *      `CODM_ENV`, `CODM_PROFILE`, `CODM_CLOUD_URL`) — these are the product's DECLARED env vars
 *      (template.config.ts REPO.env), which AC-1 explicitly excludes ("fora de env vars
 *      declaradas no manifesto"). A word-boundary matcher naturally never fires on these: there is
 *      no boundary between "CODM" and the "_" that continues it into a real key name, so this
 *      needs NO explicit allowlist — it falls out of `\bcodm\b` by construction.
 *   3. The ONE pinned cross-package wire constant, `AGENT_RUN_TOKEN_HEADER` (AgentIdentity.ts) —
 *      its value `'x-codm-run-token'` is a real HTTP header name that a SEPARATE, already-frozen
 *      constant in the generated SDK (`@codm/client-typescript` `MCP_RUN_TOKEN_HEADER`) must match
 *      BYTE FOR BYTE (pinned by `tests/architecture/mcp-exposure.test.ts`). Renaming it here without
 *      touching SDK codegen would silently BREAK agent auth; renaming both is an SDK-codegen change,
 *      out of scope for a brand sweep. Exempted by an explicit, narrow, line-anchored allowlist —
 *      the one case this rail could not derive structurally.
 *
 * Falsifier: plant a line containing "codm" as a bare word (not `@codm/...`, not `CODM_FOO`) in any
 * core file — the first test below goes RED, naming the file:line. Remove it — GREEN again. The
 * second test below is that falsifier, automated against a throwaway fixture tree.
 */

const CORE_ROOT = join(import.meta.dir, '..')
const SELF = 'src/vocabulary.test.ts'
const EXTENSIONS = ['.ts', '.tsx']
const EXEMPT_DIR_SEGMENTS = new Set(['node_modules', 'dist', '.turbo'])

// Bare "codm", any casing, word-bounded on both sides. `\b` before the '_' of "CODM_DATA_DIR" etc.
// never exists ('_' is a word character), so manifest-declared env keys are excluded STRUCTURALLY,
// not by a maintained list. `(?<!@)` is the ONE explicit exemption this pattern needs: an npm-scope
// reference like "@codm/contracts" would otherwise match "codm" (boundary exists after '@').
const FORBIDDEN = /(?<!@)\bcodm\b/i

// The one pinned wire-constant declaration line (see exemption 3 above) — matched by its own
// unique, unambiguous substring so the exemption cannot accidentally swallow anything else.
const PINNED_WIRE_EXEMPTIONS = ["AGENT_RUN_TOKEN_HEADER = 'x-codm-run-token'"]

interface Violation {
	file: string
	line: number
	text: string
}

function listFiles(dir: string, out: string[] = []): string[] {
	if (!existsSync(dir)) return out
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name)
		if (entry.isDirectory()) {
			if (EXEMPT_DIR_SEGMENTS.has(entry.name)) continue
			listFiles(full, out)
		} else if (EXTENSIONS.some(ext => entry.name.endsWith(ext))) {
			out.push(full)
		}
	}
	return out
}

function scan(root: string): Violation[] {
	const violations: Violation[] = []
	for (const file of listFiles(root)) {
		const rel = relative(root, file).split('\\').join('/')
		if (rel === SELF) continue
		const lines = readFileSync(file, 'utf8').split('\n')
		lines.forEach((lineText, idx) => {
			if (PINNED_WIRE_EXEMPTIONS.some(exempt => lineText.includes(exempt))) return
			if (FORBIDDEN.test(lineText)) violations.push({ file: rel, line: idx + 1, text: lineText.trim().slice(0, 140) })
		})
	}
	return violations
}

describe('core-TS vocabulary rail (core stays reusable by any fork — spec T11 AC-1 / upstream-prep Decision 4)', () => {
	it('no bare "codm" token (any casing) outside the @codm/ scope, declared env keys, and the pinned MCP header', () => {
		const violations = scan(CORE_ROOT)
		const report = violations.map(v => `  ${v.file}:${v.line}  →  ${v.text}`).join('\n')
		expect(
			violations.length,
			`core-TS must stay reusable by ANY fork's service — this belongs in the PRODUCT's own package ` +
				`(e.g. packages/api/typescript/src), never in core:\n${report}`,
		).toBe(0)
	})

	// Falsifier — proves the scan catches a real leak in every shape, and honors all three exemptions.
	it('fixture: bare codm/CODM caught; @codm/ imports, CODM_-prefixed env keys, and the pinned header are not', () => {
		const tmpRoot = mkdtempSync(join(tmpdir(), 'core-vocabulary-fixture-'))
		const write = (p: string, c: string) => {
			mkdirSync(p.slice(0, p.lastIndexOf('/')), { recursive: true })
			writeFileSync(p, c)
		}
		try {
			write(join(tmpRoot, 'src', 'a.ts'), `// the codm SQLite store\n`)
			write(join(tmpRoot, 'src', 'b.ts'), `export const DB_FILE = 'codm.db'\n`)
			write(join(tmpRoot, 'src', 'c.ts'), `/** The CODM agent universe has two members. */\n`)
			write(join(tmpRoot, 'src', 'ok-scope.ts'), `import { events } from '@codm/contracts/db'\n`)
			write(join(tmpRoot, 'src', 'ok-env.ts'), `const key = 'CODM_DATA_DIR'\nconst k2 = 'CODM_ENV'\n`)
			write(join(tmpRoot, 'src', 'ok-header.ts'), `export const AGENT_RUN_TOKEN_HEADER = 'x-codm-run-token'\n`)
			write(join(tmpRoot, 'src', 'ok-generic.ts'), `// a Zustand store, an encode/decode helper\n`)

			const hits = scan(tmpRoot)

			expect(hits.map(v => `${v.file}`).sort()).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts'])
		} finally {
			rmSync(tmpRoot, { recursive: true, force: true })
		}
	})
})
