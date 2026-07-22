import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

/**
 * Console-discipline guard — the mechanical half of the "all production logging goes through
 * LoggingService" convention. In this template the injected `LoggingService` lives in the core
 * sub-package (`packages/api/typescript/core/src/services/Logging/`): `OtlpLoggingService` ships
 * logs OTLP → Loki in the `real` environment, and `MockLoggingService` is the only class that
 * legitimately bottoms out to `console.*`. A raw `console.*` at a call site inside `src/` bypasses
 * that channel entirely — it never reaches Loki, carries no trace/span correlation, and can't be
 * swapped per environment.
 *
 * Scope: every `src/**\/*.ts` (non-test) in the `api/typescript` package. The core sub-package is a
 * separate workspace at `packages/api/typescript/core/`, OUTSIDE this scan's `../../src` root, so
 * `MockLoggingService`/`LoggingBinding` (the sanctioned console bottoms) are out of scope by
 * construction and need no exemption here.
 *
 * Flags any `console.log(` / `console.error(` / `console.warn(` / `console.info(` / `console.debug(`
 * occurrence — including inside a comment, since this is a source-text scan (molde
 * `tx-discipline.test.ts` / `probe-discipline.test.ts`), not an AST parse. A comment that merely
 * MENTIONS a console method without the call-shaped `console.x(` substring is invisible to the
 * regex and never needs an exemption.
 *
 * Named EXEMPTIONS (why inline) cover:
 *   - index.ts — the composition root / bootstrap + graceful-shutdown handlers; runs before (and
 *     after) the DI-driven request-handling window, so it must survive even a broken LoggingService
 *     binding and cannot resolve one during startup/shutdown.
 *   - auth/handlers/UserRegisteredHandler.ts — a scaffold handler whose body is a placeholder
 *     `console.log`; carries a `// TODO` to migrate to the injected LoggingService once handler-side
 *     logging is wired (this exemption is temporary, not a sanctioned bottom like index.ts).
 *
 * False positives go in EXEMPTIONS below with a `why`, never by weakening the regex.
 *
 * Lives in `tests/architecture/` — the shared home for all repo-wide/context-wide mechanical
 * detectors (see `tests/architecture/README.md`). Repo-wide scope, zero context-name coupling.
 */

const API_SRC = join(import.meta.dir, '..', '..', 'src')

const EXEMPTIONS: { file: string; why: string }[] = [
	{
		file: 'index.ts',
		why: 'composition root / bootstrap + graceful-shutdown + start-failure handlers — must survive even a broken LoggingService binding, and run both before and after the DI-driven request-handling window, so it cannot resolve the injected LoggingService for its startup/shutdown console output.',
	},
	{
		file: 'auth/handlers/UserRegisteredHandler.ts',
		// TODO(cc-console): replace the placeholder console.log with the injected LoggingService once
		// handler-side logging is wired (inject LoggingService via the constructor, log via
		// this.loggingService.info({ content: { ... } })). Scaffold handler — temporary exemption,
		// remove this entry when the migration lands.
		why: 'scaffold handler — its body is a placeholder console.log announcing the registered user; must migrate to the injected LoggingService (see the TODO above). Temporary exemption, not a sanctioned console bottom.',
	},
]

interface Violation {
	file: string
	line: number
	text: string
}

const CONSOLE_CALL_RE = /console\.(log|error|warn|info|debug)\(/

function listSourceFiles(dir: string): string[] {
	const out: string[] = []
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name)
		if (entry.isDirectory()) {
			if (entry.name === 'node_modules') continue
			out.push(...listSourceFiles(full))
		} else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
			out.push(full)
		}
	}
	return out
}

/** Scans `srcRoot` for `console.<level>(` occurrences in non-test `.ts` files, honoring EXEMPTIONS
 *  (matched by exact relative-to-`srcRoot` path, mirroring `srcRoot`'s own `src/` layout). */
function scanForViolations(srcRoot: string): Violation[] {
	const violations: Violation[] = []
	const exemptFiles = new Set(EXEMPTIONS.map(e => e.file))

	for (const file of listSourceFiles(srcRoot)) {
		const rel = relative(srcRoot, file).split('\\').join('/')
		if (exemptFiles.has(rel)) continue

		const content = readFileSync(file, 'utf8')
		const lines = content.split('\n')
		lines.forEach((lineText, idx) => {
			if (CONSOLE_CALL_RE.test(lineText)) {
				violations.push({ file: rel, line: idx + 1, text: lineText.trim() })
			}
		})
	}

	return violations
}

describe('console-discipline (production code logs via LoggingService, never console.*)', () => {
	test('src/**/*.ts (non-test) contains no console.log/error/warn/info/debug( call outside EXEMPTIONS', () => {
		const violations = scanForViolations(API_SRC)

		const report = violations.map(v => `  ${v.file}:${v.line}  →  ${v.text}`).join('\n')
		expect(
			violations.length,
			`Production file(s) with a raw console.* call — route through the injected LoggingService ` +
				`(OTLP → Loki in the real environment) instead. Add a named EXEMPTIONS entry with a why only ` +
				`for genuinely DI-less/bootstrap/pre-container code:\n${report}`,
		).toBe(0)
	})

	// Negative fixture — proves the scan actually catches an offender outside the exempted files,
	// using a real temp directory (not the real repo tree, molde `probe-discipline.test.ts`) so this
	// can't accidentally pass just because nothing in the real tree happens to violate the rule.
	test('fixture: a non-exempted file with a raw console.warn( call is flagged; a LoggingService call and a comment mention are not', () => {
		const tmpRoot = mkdtempSync(join(tmpdir(), 'console-discipline-fixture-'))
		try {
			const offenderDir = join(tmpRoot, 'tenancy', 'jobs')
			const cleanDir = join(tmpRoot, 'tenancy', 'handlers')
			mkdirSync(offenderDir, { recursive: true })
			mkdirSync(cleanDir, { recursive: true })

			// Offender — a plain class somewhere entirely outside EXEMPTIONS, logging via raw console.
			writeFileSync(join(offenderDir, 'SomeJob.ts'), `export class SomeJob {\n  run() {\n    console.warn('something happened')\n  }\n}\n`)

			// Control — same tree, uses the injected LoggingService instead. Must NOT be flagged. A
			// comment merely NAMING a console method (no call-shaped parenthesis) must NOT be flagged
			// either — the mold used across this repo's other detector-satisfying comment rewordings.
			writeFileSync(
				join(cleanDir, 'SomeHandler.ts'),
				`export class SomeHandler {\n  // this used to log via console.warn as plain text, no parens\n  constructor(private loggingService: LoggingService) {}\n  run() {\n    this.loggingService.warn({ content: { message: 'something happened' } })\n  }\n}\n`,
			)

			const violations = scanForViolations(tmpRoot)

			expect(violations.map(v => v.file)).toEqual(['tenancy/jobs/SomeJob.ts'])
		} finally {
			rmSync(tmpRoot, { recursive: true, force: true })
		}
	})
})
