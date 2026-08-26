import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

/**
 * Event-name guard (EVT-03) — the naming half of the event canon, closing the routing contract that
 * `event-placement.test.ts` (EVT-01/EVT-02) leaves open. The outbox routes EVERY persisted event by
 * one predicate — `event.name.startsWith('integration.')` picks the ExternalMediator
 * (cross-service), anything else the InternalMediator (in-process); see
 * `core/src/services/OutboxDispatcher/LibSqlOutboxDispatcher.ts` (routing introduced in 6b9c7578e).
 * That makes the `integration.` prefix a RESERVED namespace with exactly one legitimate author:
 * `packages/contracts` TypeSpec (`wire/events/*.tsp`), whose emitters hard-assert the prefix IS
 * present (`packages/contracts/codegen/lib/assert-wire-names.ts`).
 *
 * This rail enforces the inverse direction for hand-written `src/` code: no event class authored
 * api-side may CLAIM the prefix. A domain event named `integration.<x>` would be silently published
 * to the ExternalMediator — leaking a context-private fact across the service boundary instead of
 * fanning out in-process. Together the three guards make the routing predicate total:
 *   - contracts emitters: every wire event name starts with `integration.` (external half);
 *   - EVT-02: integration events are never authored in `src` (single author);
 *   - EVT-03 (this rail): no `static … name` literal in `src` starts with `integration.`.
 *
 * Scope: every `src/**\/*.ts` (non-test) in the `api/typescript` package — same root as
 * `console-discipline.test.ts`. Mechanics: a source-text scan (molde `console-discipline.test.ts`,
 * not an AST parse) for `static [override] readonly name = '<literal>'` declarations whose literal
 * starts with `integration.`. A comment or ordinary string merely MENTIONING the prefix does not
 * match the declaration shape and never needs an exemption.
 *
 * False positives go in EXEMPTIONS below with a `why`, never by weakening the regex.
 *
 * Lives in `tests/architecture/` — the shared home for repo-wide mechanical detectors (see
 * `tests/architecture/README.md`).
 */

const API_SRC = join(import.meta.dir, '..', '..', 'src')

const EXEMPTIONS: { file: string; why: string }[] = [
	// Empty today — the tree is clean. Any future entry names a specific file whose static `name`
	// literal legitimately carries the `integration.` prefix, with a real, non-derivable reason.
]

interface Violation {
	file: string
	line: number
	text: string
}

/** A `static [override] readonly name = '<literal>'` declaration claiming the reserved prefix. */
const RESERVED_STATIC_NAME_RE = /static\s+(?:override\s+)?readonly\s+name\s*=\s*['"]integration\./

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

/** Scans `srcRoot` for static name declarations claiming the `integration.` prefix in non-test
 *  `.ts` files, honoring EXEMPTIONS (matched by exact relative-to-`srcRoot` path). */
function scanForViolations(srcRoot: string): Violation[] {
	const violations: Violation[] = []
	const exemptFiles = new Set(EXEMPTIONS.map(e => e.file))

	for (const file of listSourceFiles(srcRoot)) {
		const rel = relative(srcRoot, file).split('\\').join('/')
		if (exemptFiles.has(rel)) continue

		const lines = readFileSync(file, 'utf8').split('\n')
		lines.forEach((lineText, idx) => {
			if (RESERVED_STATIC_NAME_RE.test(lineText)) {
				violations.push({ file: rel, line: idx + 1, text: lineText.trim() })
			}
		})
	}

	return violations
}

describe('event-name-discipline (the `integration.` name prefix is reserved for contracts-born events)', () => {
	test('EVT-03: no src event class declares a static name starting with "integration." outside EXEMPTIONS', () => {
		const violations = scanForViolations(API_SRC)

		const report = violations.map(v => `  ${v.file}:${v.line}  →  ${v.text}`).join('\n')
		expect(
			violations.length,
			`Event class(es) in src claim the reserved "integration." name prefix — the outbox routes by ` +
				`event.name.startsWith('integration.') (LibSqlOutboxDispatcher, since 6b9c7578e), so this event ` +
				`would be published to the ExternalMediator, leaking a context-private fact across the service ` +
				`boundary instead of fanning out in-process. Rename it to "<context>.<fact>" — or, if the fact ` +
				`genuinely crosses services, author it in packages/contracts (wire/events/*.tsp), regen, and ` +
				`consume the generated binding (EVT-02):\n${report}`,
		).toBe(0)
	})

	// Negative fixture — proves the scan actually catches an offender, using a real temp directory
	// (not the real repo tree, molde `console-discipline.test.ts`) so this can't accidentally pass
	// just because nothing in the real tree happens to violate the rule.
	test('fixture: a domain event claiming "integration." is flagged; a dotted context name and a comment mention are not', () => {
		const tmpRoot = mkdtempSync(join(tmpdir(), 'event-name-discipline-fixture-'))
		try {
			const offenderDir = join(tmpRoot, 'quota', 'events')
			const cleanDir = join(tmpRoot, 'billing', 'events')
			mkdirSync(offenderDir, { recursive: true })
			mkdirSync(cleanDir, { recursive: true })

			// Offender — a hand-written domain event squatting on the reserved routing prefix.
			writeFileSync(
				join(offenderDir, 'SneakyEvent.ts'),
				`export class SneakyEvent extends BaseDomainEvent<typeof SneakyEventSchema> {\n` +
					`\tstatic override readonly name = 'integration.quota.sneaky' as const\n` +
					`}\n`,
			)

			// Control — a proper `<context>.<fact>` domain event must NOT be flagged; neither must a
			// comment that merely MENTIONS the prefix, nor an ordinary string carrying it outside the
			// static-name declaration shape.
			writeFileSync(
				join(cleanDir, 'InvoicePaidEvent.ts'),
				`// the outbox routes names starting with integration. to the ExternalMediator\n` +
					`const topic = 'integration.billing.subscription_changed' // consuming a contracts-born name is fine\n` +
					`export class InvoicePaidEvent extends BaseDomainEvent<typeof InvoicePaidEventSchema> {\n` +
					`\tstatic override readonly name = 'billing.invoice.paid' as const\n` +
					`}\n`,
			)

			const violations = scanForViolations(tmpRoot)

			expect(violations.map(v => v.file)).toEqual(['quota/events/SneakyEvent.ts'])
		} finally {
			rmSync(tmpRoot, { recursive: true, force: true })
		}
	})
})
