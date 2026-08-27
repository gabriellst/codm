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
 *   - server.ts — the boot CHOREOGRAPHY (T4, spec 2026-08-10-eixo-unico-ambiente): `start()` runs
 *     the `EMIT_OPENAPI` emit-only exit before any HTTP server (or even the driver migration) comes
 *     up, and its `stop()` drain warns about a FAILED shutdown step (which may be the very
 *     LoggingService binding misbehaving) — both are the same class of DI-window-edge bootstrap
 *     output that used to live inline in index.ts pre-T4. index.ts itself shrank to a process shell
 *     that only calls `start()`/`server.stop()`, so this exemption moved with the code.
 *   - index.ts — the process shell: signal handlers + the top-level `start().catch(...)` failure
 *     handler; runs before (and after) the DI-driven request-handling window, so it must survive
 *     even a broken LoggingService binding and cannot resolve one during startup/shutdown.
 *   - auth/handlers/UserRegisteredHandler.ts — a scaffold handler whose body is a placeholder
 *     `console.log`; carries a `// TODO` to migrate to the injected LoggingService once handler-side
 *     logging is wired (this exemption is temporary, not a sanctioned bottom like index.ts).
 *   - watchdog.ts — the desktop shell's dead-man's switch, started BY index.ts and in the same
 *     bootstrap class: it speaks once, on the way out, when the supervising shell has died. Same
 *     sanctioned bottom as index.ts, not a temporary one.
 *   - bootPhase.ts — the boot-phase crumb trail `index.ts`/`server.ts` wrap every boot step in
 *     (`phase(name, fn)`). Same sanctioned bottom as those two, for the same reason: the earliest
 *     phases (the data-dir lock, `bindContexts` itself) run BEFORE the injected `LoggingService` is
 *     even resolvable (it is a token in the `shared` registry, bound only once `bindContexts` has
 *     run), and once it IS resolvable its `real` binding can route to OTLP-only (no stdout) —
 *     exactly the boot that needs a crumb trail most (an unreachable/misconfigured collector) is
 *     the boot where a LoggingService-routed crumb would print nothing to `shell.log`.
 *
 * False positives go in EXEMPTIONS below with a `why`, never by weakening the regex.
 *
 * Lives in `tests/architecture/` — the shared home for all repo-wide/context-wide mechanical
 * detectors (see `tests/architecture/README.md`). Repo-wide scope, zero context-name coupling.
 */

const API_SRC = join(import.meta.dir, '..', '..', 'src')
/**
 * A RAIZ DE COMPOSIÇÃO também é código de produção, e passou a ser um diretório próprio.
 *
 * Quando `server.ts` saiu de `src/` (passo 6), ele saiu junto DESTA varredura — e o sintoma não foi
 * um vermelho aqui, foi o `allowlist-liveness` acusando a isenção dele como fóssil. Ou seja: mover um
 * arquivo de produção para fora de `src/` reduzia a cobertura em silêncio, e só um rail sobre OUTRO
 * rail percebeu. Varrer as duas raízes é o que impede a próxima mudança de pasta de fazer o mesmo.
 */
const API_COMPOSITION = join(import.meta.dir, '..', '..', 'composition')

const EXEMPTIONS: { file: string; why: string }[] = [
	{
		file: 'server.ts',
		why: 'boot choreography (T4): the EMIT_OPENAPI emit-only exit runs before the driver migration/HTTP server exist, and the shutdown-step warning must survive a failing LoggingService itself — same DI-window-edge bootstrap class as index.ts, which this code moved out of.',
	},
	{
		file: 'index.ts',
		why: 'composition root / bootstrap + graceful-shutdown + start-failure handlers — must survive even a broken LoggingService binding, and run both before and after the DI-driven request-handling window, so it cannot resolve the injected LoggingService for its startup/shutdown console output.',
	},
	{
		file: 'bootPhase.ts',
		why: 'the phase(name, fn) crumb-trail helper `index.ts`/`server.ts` wrap every boot step in — the earliest phases run before LoggingService is resolvable, and its `real` binding can route to OTLP-only (no stdout), which is exactly the failure mode a boot-hang crumb trail needs to survive.',
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
	test('src/** and composition/** (non-test) contain no console.log/error/warn/info/debug( call outside EXEMPTIONS', () => {
		const violations = [...scanForViolations(API_SRC), ...scanForViolations(API_COMPOSITION)]

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
