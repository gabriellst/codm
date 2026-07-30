import { describe, expect, it } from 'bun:test'
import { PASSES, type Pass, isOutOfUniverse, rewriteContent } from './rebrand-codm'

/**
 * THE FALSIFIER OF THE WHITELIST.
 *
 * The hard part of this rebrand is not substituting a string — it is knowing where NOT to.
 * A blind `codedm → codm` over the repo produces, among other things, `.specs/codm/…`: a path
 * that does not exist, inside a docblock that exists precisely to point a future reader at the
 * spec that justified the code. Every `it` below is a rule of D-D with a concrete counter-example.
 *
 * The tests drive the PURE function (`rewriteContent`), never the walker: iterating
 * `git ls-files` is trivial wiring, and the judgment all lives in the rules.
 */

/** A production path — nothing about it is whitelisted, so it is the honest control. */
const PROD = 'packages/api/typescript/src/agent/mcp/wire.ts'

const rewrite = (text: string, pass: Pass, path = PROD): string => rewriteContent(path, text, pass).text
const count = (text: string, pass: Pass, path = PROD): number => rewriteContent(path, text, pass).count

/** Runs the four passes in their declared order — the shape the four commits produce. */
function pipeline(text: string, path = PROD): string {
	return PASSES.reduce((acc, pass) => rewriteContent(path, acc, pass).text, text)
}

describe('rule 3 — `x-error-codes` is an OpenAPI extension, not the brand', () => {
	it('survives all four passes byte-identical', () => {
		const line = '"x-error-codes": ["THREAD_NOT_FOUND", "WORKSPACE_ALREADY_LINKED"]'
		for (const pass of PASSES) expect(rewrite(line, pass)).toBe(line)
		expect(pipeline(line)).toBe(line)
	})

	it('survives even when the same line carries a real target', () => {
		const line = `import { ERROR_CODES } from '@codedm/client-typescript/errors' // reads "x-error-codes"`
		expect(rewrite(line, 'scope')).toBe(`import { ERROR_CODES } from '@codm/client-typescript/errors' // reads "x-error-codes"`)
	})
})

describe('rule 2 — a line citing a historical path is preserved byte-for-byte, in ANY file', () => {
	it('preserves the `.specs/codedm/` docblock while rewriting the import above it', () => {
		// The real shape in HEAD: ClaudeAgentRunner.ts, AgentFrame.ts, wire_identity_test.go and 8
		// others cite `.specs/codedm/…` from inside production docblocks.
		const input = [`import { z } from '@codedm/core-typescript'`, ' * ver .specs/codedm/2026-07-26-agent-driving-stream-json.md'].join('\n')
		const out = rewrite(input, 'scope')
		expect(out.split('\n')[0]).toBe(`import { z } from '@codm/core-typescript'`)
		expect(out.split('\n')[1]).toBe(' * ver .specs/codedm/2026-07-26-agent-driving-stream-json.md')
		expect(count(input, 'scope')).toBe(1)
	})

	it('preserves it under the text pass too — the pass whose catch-all would rewrite it', () => {
		const line = ' * The Fase-2 smoke (`.specs/codedm/phase2-smoke/`, divergence D4) measured…'
		expect(rewrite(line, 'text')).toBe(line)
		expect(count(line, 'text')).toBe(0)
	})

	it('preserves a `.plans/` citation the same way', () => {
		const line = '// Plan: .plans/2026-07-30-a-renames-codm.md — the codedm rebrand'
		for (const pass of PASSES) expect(rewrite(line, pass)).toBe(line)
	})

	it('preserves the .gitignore lines that decide what is versioned', () => {
		// `.gitignore:72,77` — rewriting these changes WHICH files are tracked, silently.
		const input = ['# .specs/codedm/phase10-smoke/real-smoke-run.log sits on', '!.specs/codedm/phase0-smoke/*.log'].join('\n')
		expect(pipeline(input, '.gitignore')).toBe(input)
	})

	it('is a LINE filter, not a file filter — the rest of the file still moves', () => {
		const input = ['// .specs/codedm/OVERNIGHT-REPORT.md', `import { z } from '@codedm/core-typescript'`, 'const CODEDM_DATA_DIR = 1'].join(
			'\n',
		)
		expect(pipeline(input)).toBe(
			['// .specs/codedm/OVERNIGHT-REPORT.md', `import { z } from '@codm/core-typescript'`, 'const CODM_DATA_DIR = 1'].join('\n'),
		)
	})
})

describe('rule 1 — `.plans/**` and `.specs/**` are rejected whole', () => {
	const body = ['# codedm', `import '@codedm/core-typescript'`, 'CODEDM_DATA_DIR', 'CodeDM'].join('\n')

	it('rejects a .plans file', () => {
		expect(isOutOfUniverse('.plans/2026-07-30-a-renames-codm.md')).toBe(true)
		for (const pass of PASSES) expect(rewrite(body, pass, '.plans/2026-07-30-a-renames-codm.md')).toBe(body)
	})

	it('rejects a .specs file, including the canonical rust-wire spec', () => {
		expect(isOutOfUniverse('.specs/2026-07-30-rust-wire-and-tauri-sdk-design.md')).toBe(true)
		expect(isOutOfUniverse('.specs/codedm/GOAL-agent-abstraction.md')).toBe(true)
		for (const pass of PASSES) expect(rewrite(body, pass, '.specs/codedm/BUILD-LOG.md')).toBe(body)
	})

	it('does NOT reject a production file whose name merely resembles one', () => {
		expect(isOutOfUniverse('packages/app/astro/src/pages/[locale]/_content/loaders/plans.ts')).toBe(false)
	})
})

describe('rule 4 — dated handoffs are a record, like .plans (OQ-1: whitelist CONFIRMED)', () => {
	const body = `> Fonte da verdade: \`.specs/codedm/BUILD-LOG.md\` — o repo codedm, pacotes @codedm/*`

	it('rejects HANDOFF.md and HANDOFF-2026-07-23-ORG.md', () => {
		expect(isOutOfUniverse('HANDOFF.md')).toBe(true)
		expect(isOutOfUniverse('HANDOFF-2026-07-23-ORG.md')).toBe(true)
		for (const pass of PASSES) expect(rewrite(body, pass, 'HANDOFF.md')).toBe(body)
	})

	it('rejects docs/handoff/*.md', () => {
		expect(isOutOfUniverse('docs/handoff/2026-07-28-orchestrator-pivot-handoff.md')).toBe(true)
		for (const pass of PASSES) expect(rewrite(body, pass, 'docs/handoff/2026-07-28-orchestrator-pivot-handoff.md')).toBe(body)
	})

	it('does NOT reject the rest of docs/', () => {
		expect(isOutOfUniverse('docs/BACKEND.md')).toBe(false)
		expect(isOutOfUniverse('docs/ECOSYSTEM.md')).toBe(false)
	})
})

describe('rule 5 — bun.lock is regenerated by `bun install`, never edited', () => {
	it('is out of the universe', () => {
		expect(isOutOfUniverse('bun.lock')).toBe(true)
		const body = '"@codedm/core-typescript": ["@codedm/core-typescript@workspace:packages/api/typescript/core"]'
		expect(rewrite(body, 'scope', 'bun.lock')).toBe(body)
	})
})

describe('rule 7 — the codemod excludes ITSELF (it carries the substitution tables)', () => {
	it('rejects its own two files', () => {
		// Without this the `scope` pass rewrites the literal '@codedm/' inside its OWN table, and
		// every later `--check` reports 0 for a reason that has nothing to do with the repo.
		expect(isOutOfUniverse('scripts/rebrand-codm.ts')).toBe(true)
		expect(isOutOfUniverse('scripts/rebrand-codm.test.ts')).toBe(true)
		const table = `{ from: '@codedm/', to: '@codm/' }`
		for (const pass of PASSES) expect(rewrite(table, pass, 'scripts/rebrand-codm.ts')).toBe(table)
	})

	it('does not reject its neighbours in scripts/', () => {
		expect(isOutOfUniverse('scripts/check-generated.ts')).toBe(false)
		expect(isOutOfUniverse('scripts/env/generate.ts')).toBe(false)
	})
})

describe('pass scoping — each pass moves its OWN surface and nothing else', () => {
	const fixture = [
		`import { z } from '@codedm/core-typescript'`,
		'CODEDM_DATA_DIR=~/.codedm/data',
		'name = "codedm-contracts-rust"',
		'use codedm_contracts_rust::wire;',
		'const brand = "CodeDM"',
	].join('\n')

	it('scope moves `@codedm/` and leaves env, crates and prose alone', () => {
		const out = rewrite(fixture, 'scope')
		expect(out).toContain(`'@codm/core-typescript'`)
		expect(out).toContain('CODEDM_DATA_DIR=~/.codedm/data')
		expect(out).toContain('codedm-contracts-rust')
		expect(out).toContain('CodeDM')
		expect(count(fixture, 'scope')).toBe(1)
	})

	it('env moves `CODEDM_`, `~/.codedm` and `codedm.db`, and leaves the scope alone', () => {
		const out = rewrite(fixture, 'env')
		expect(out).toContain('CODM_DATA_DIR=~/.codm/data')
		expect(out).toContain(`'@codedm/core-typescript'`)
		expect(rewrite('dbFileName = "codedm.db"', 'env')).toBe('dbFileName = "codm.db"')
	})

	it('brand moves the 5 crates, the sidecar binaries and the Tauri identifier — not env', () => {
		const out = rewrite(fixture, 'brand')
		expect(out).toContain('name = "codm-contracts-rust"')
		expect(out).toContain('use codm_contracts_rust::wire;')
		expect(out).toContain('CODEDM_DATA_DIR')
		expect(rewrite('name: "codedm-daemon"', 'brand')).toBe('name: "codm-daemon"')
		expect(rewrite('"identifier": "app.codedm.desktop"', 'brand')).toBe('"identifier": "app.codm.desktop"')
		expect(rewrite('name = "codedm-desktop"', 'brand')).toBe('name = "codm-desktop"')
		expect(rewrite('[lib]\nname = "codedm_desktop_lib"', 'brand')).toBe('[lib]\nname = "codm_desktop_lib"')
		expect(rewrite(`crate = 'codedm-client-rust-codegen'`, 'brand')).toBe(`crate = 'codm-client-rust-codegen'`)
	})

	it('text closes the residue — prose, the locale cookie, the repo URL', () => {
		expect(rewrite('const brand = "CodeDM"', 'text')).toContain('CODM')
		expect(rewrite(`LOCALE_COOKIE = 'codedm_locale'`, 'text')).toBe(`LOCALE_COOKIE = 'codm_locale'`)
		expect(rewrite('https://github.com/codedm/codedm', 'text')).toBe('https://github.com/codm/codm')
	})
})

describe('casing — the brand has four shapes in HEAD and each has its own target', () => {
	it('`CodeDM` becomes all-caps `CODM`, never `Codm`', () => {
		expect(rewrite('@CodeDM ping', 'text')).toBe('@CODM ping')
		expect(rewrite('# CodeDM — root environment variables', 'text')).toBe('# CODM — root environment variables')
	})

	it('`CODEDM_` becomes `CODM_` (env pass owns every upper-case occurrence in HEAD)', () => {
		expect(rewrite('CODEDM_ROOT', 'env')).toBe('CODM_ROOT')
		expect(rewrite('CODEDM_E2E', 'env')).toBe('CODM_E2E')
	})

	it('`Codedm` becomes `Codm` — the PascalCase identifier form (isCodedmTool)', () => {
		// The 4th casing, present 4× in HEAD (wire.ts + StreamJsonToTurnFactAccumulator.ts) and absent
		// from the plan's table. `CODM` would read as `isCODMTool`; the identifier casing is preserved.
		expect(rewrite('export function isCodedmTool(toolName: string)', 'text')).toBe('export function isCodmTool(toolName: string)')
	})

	it('lower-case `codedm` is the catch-all, and it runs LAST inside the text pass', () => {
		expect(rewrite('the codedm repo', 'text')).toBe('the codm repo')
		expect(rewrite(`FALLBACK_TAG = 'codedm'`, 'text')).toBe(`FALLBACK_TAG = 'codm'`)
	})
})

describe('the repo-identity const — file-scoped, because `@codedm` bare is a MENTION TAG elsewhere', () => {
	it("scope rewrites `const scope = '@codedm'` in template.config.ts", () => {
		expect(rewrite(`const scope = '@codedm'`, 'scope', 'template.config.ts')).toBe(`const scope = '@codm'`)
	})

	it('scope does NOT touch a bare `@codedm` anywhere else — that is the mention tag, and it is T7', () => {
		// MentionGate.test.ts asserts `mintMentionTag('/…/pessoal/codedm')` === '@codedm'. Rewriting the
		// expectation in the scope pass while the folder name and FALLBACK_TAG stay put turns a live
		// rail red mid-rebrand. The tag moves in `text`, together with FALLBACK_TAG (D-G).
		const line = `expect(mintMentionTag('/Users/work/Desktop/Projetos/pessoal/codedm')).toBe('@codedm')`
		expect(rewrite(line, 'scope', 'packages/api/typescript/src/thread/schemas/MentionGate.test.ts')).toBe(line)
		expect(rewrite(line, 'text', 'packages/api/typescript/src/thread/schemas/MentionGate.test.ts')).toBe(
			`expect(mintMentionTag('/Users/work/Desktop/Projetos/pessoal/codm')).toBe('@codm')`,
		)
	})

	it('the brand const falls to the text catch-all, as the plan declares', () => {
		expect(rewrite(`const brand = 'codedm'`, 'brand', 'template.config.ts')).toBe(`const brand = 'codedm'`)
		expect(rewrite(`const brand = 'codedm'`, 'text', 'template.config.ts')).toBe(`const brand = 'codm'`)
	})
})

describe('idempotence — a second run of any pass is a no-op, which is what makes --check honest', () => {
	const fixture = [
		`import { z } from '@codedm/core-typescript'`,
		`const scope = '@codedm'`,
		'CODEDM_DATA_DIR=~/.codedm/data # codedm.db lives here',
		'CODEDM_ROOT',
		'name = "codedm-desktop" # codedm_desktop_lib, codedm-client-rust, codedm_client_rust',
		'name = "codedm-contracts-rust" # codedm_contracts_rust',
		'externalBin: ["binaries/codedm-daemon", "binaries/codedm-gateway"]',
		'"identifier": "app.codedm.desktop"',
		`LOCALE_COOKIE = 'codedm_locale'`,
		'https://github.com/codedm/codedm',
		'name: "codedm-plans"',
		`mkdtempSync(join(tmpdir(), 'codedm-e2e-data-'))`,
		'@CodeDM and CodeDM and isCodedmTool and plain codedm',
		'"x-error-codes": ["FOO"]',
		' * see .specs/codedm/phase2-smoke/raw/ and .plans/2026-07-30-a-renames-codm.md',
	].join('\n')

	for (const pass of PASSES) {
		it(`pass \`${pass}\` is idempotent`, () => {
			const once = rewrite(fixture, pass, 'template.config.ts')
			expect(rewrite(once, pass, 'template.config.ts')).toBe(once)
			expect(count(once, pass, 'template.config.ts')).toBe(0)
		})
	}

	it('the whole pipeline is idempotent, and leaves exactly the whitelisted line behind', () => {
		const once = pipeline(fixture, 'template.config.ts')
		expect(pipeline(once, 'template.config.ts')).toBe(once)
		// The ONLY surviving `codedm` is the historical-citation line — rule 2, byte-for-byte.
		const survivors = once.split('\n').filter(l => /codedm/i.test(l))
		expect(survivors).toEqual([' * see .specs/codedm/phase2-smoke/raw/ and .plans/2026-07-30-a-renames-codm.md'])
	})

	it('leaves no `codedm` outside the whitelist — the shape AC-10 asserts on the real tree', () => {
		const clean = pipeline(
			[
				`import { z } from '@codedm/core-typescript'`,
				'CODEDM_DATA_DIR=~/.codedm/data',
				'name = "codedm-contracts-rust"',
				'CodeDM / Codedm / codedm',
			].join('\n'),
		)
		expect(clean).not.toMatch(/codedm/i)
	})
})

describe('binary content is never rewritten', () => {
	it('leaves content carrying a NUL byte untouched', () => {
		// `git ls-files` lists .png/.ico/.woff too; a byte-wise replace over one corrupts it silently.
		const binary = 'codedm\u0000codedm'
		for (const pass of PASSES) expect(rewrite(binary, pass)).toBe(binary)
		expect(count(binary, 'text')).toBe(0)
	})
})
