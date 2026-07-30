import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve, dirname } from 'node:path'

/**
 * Event-placement guard (EVT-01 + EVT-02) — the event twin of `enum-placement.test.ts`, enforcing
 * the event half of the contracts canon:
 *
 *   - DOMAIN events (`z.domainEvent` + `BaseDomainEvent`, living in `src/<ctx>/events/`) are
 *     CONTEXT-PRIVATE. They never cross a bounded-context boundary — a context that needs to react
 *     to another context's fact listens to an INTEGRATION event instead.
 *   - INTEGRATION events are born in `packages/contracts` (TypeSpec, `wire/events/*.tsp`) and
 *     consumed from the generated binding (`@codm/contracts-typescript/wire/events`). They are
 *     never authored in `src` — contracts is the source of truth for everything that crosses
 *     contexts or services (same rule as cross-boundary enums).
 *
 * Two source-text scans (molde `console-discipline.test.ts` — a grep, not an AST parse):
 *   EVT-01 — no file under `src/<ctxA>/` imports from another context's `events` dir, via alias
 *            (`@<ctxB>/events`) or via a relative path resolving into `src/<ctxB>/events`.
 *   EVT-02 — no `z.integrationEvent(` call in `src` (an integration event authored api-side would
 *            bypass contracts and the Go binding entirely).
 *
 * Current legitimate shape: billing publishes `SubscriptionChangedEvent` (contracts) and quota's
 * `GovernResourcesOnSubscriptionChangedHandler` consumes it — both through the binding. All 23
 * `src/billing/events/*` stay billing-internal.
 *
 * Lives in `tests/architecture/` — the shared home for repo-wide mechanical detectors.
 */

const API_SRC = join(import.meta.dir, '..', '..', 'src')

const ALIAS_EVENTS_IMPORT_RE = /from\s+'@([a-z-]+)\/events/
const RELATIVE_IMPORT_RE = /from\s+'(\.\.?\/[^']*)'/
const INTEGRATION_AUTHORING_RE = /z\.integrationEvent\(/

interface Violation {
	file: string
	line: number
	text: string
}

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

/** The bounded context a src file belongs to — its first path segment under the scan root. */
function contextOf(relPath: string): string {
	return relPath.split('/')[0] ?? ''
}

/** EVT-01: imports reaching into ANOTHER context's events dir (alias or resolved-relative). */
function scanCrossContextEventImports(srcRoot: string): Violation[] {
	const violations: Violation[] = []
	for (const file of listSourceFiles(srcRoot)) {
		const rel = relative(srcRoot, file).split('\\').join('/')
		const ctx = contextOf(rel)
		const lines = readFileSync(file, 'utf8').split('\n')
		lines.forEach((lineText, idx) => {
			const alias = lineText.match(ALIAS_EVENTS_IMPORT_RE)
			if (alias?.[1] !== undefined && alias[1] !== ctx) {
				violations.push({ file: rel, line: idx + 1, text: lineText.trim() })
				return
			}
			const relImport = lineText.match(RELATIVE_IMPORT_RE)
			if (relImport?.[1] !== undefined) {
				const resolved = resolve(dirname(file), relImport[1])
				const resolvedRel = relative(srcRoot, resolved).split('\\').join('/')
				// Only inspect paths that stay inside src and reach an events dir of a DIFFERENT context.
				if (!resolvedRel.startsWith('..') && /(^|\/)events(\/|$)/.test(resolvedRel) && contextOf(resolvedRel) !== ctx) {
					violations.push({ file: rel, line: idx + 1, text: lineText.trim() })
				}
			}
		})
	}
	return violations
}

/** EVT-02: `z.integrationEvent(` authored anywhere in src. */
function scanIntegrationAuthoring(srcRoot: string): Violation[] {
	const violations: Violation[] = []
	for (const file of listSourceFiles(srcRoot)) {
		const rel = relative(srcRoot, file).split('\\').join('/')
		const lines = readFileSync(file, 'utf8').split('\n')
		lines.forEach((lineText, idx) => {
			if (INTEGRATION_AUTHORING_RE.test(lineText)) {
				violations.push({ file: rel, line: idx + 1, text: lineText.trim() })
			}
		})
	}
	return violations
}

describe('event-placement (domain events are context-private; integration events are born in contracts)', () => {
	test("EVT-01: no src file imports another context's events dir (domain events never cross contexts)", () => {
		const violations = scanCrossContextEventImports(API_SRC)
		const report = violations.map(v => `  ${v.file}:${v.line}  →  ${v.text}`).join('\n')
		expect(
			violations.length,
			`A context imports another context's DOMAIN events — domain events are context-private. ` +
				`React to a cross-context fact via an INTEGRATION event: author it in packages/contracts ` +
				`(wire/events/*.tsp), regen (bun contracts), and consume it from ` +
				`'@codm/contracts-typescript/wire/events':\n${report}`,
		).toBe(0)
	})

	test('EVT-02: no integration event is authored in src (z.integrationEvent belongs to contracts codegen)', () => {
		const violations = scanIntegrationAuthoring(API_SRC)
		const report = violations.map(v => `  ${v.file}:${v.line}  →  ${v.text}`).join('\n')
		expect(
			violations.length,
			`An integration event is authored api-side — integration events are born in packages/contracts ` +
				`TypeSpec (wire/events/*.tsp) so both the TS and Go bindings share the contract. Move the ` +
				`definition to contracts and import the generated event instead:\n${report}`,
		).toBe(0)
	})

	// Negative fixtures — prove each scan catches an offender (temp dir, not the real tree).
	test('fixture: a cross-context events import (alias + relative) and a src z.integrationEvent are flagged; same-context and contracts imports are not', () => {
		const tmpRoot = mkdtempSync(join(tmpdir(), 'event-placement-fixture-'))
		const write = (p: string, c: string) => {
			mkdirSync(p.slice(0, p.lastIndexOf('/')), { recursive: true })
			writeFileSync(p, c)
		}
		try {
			write(join(tmpRoot, 'billing', 'events', 'InvoicePaidEvent.ts'), `export class InvoicePaidEvent {}\n`)
			// Offender 1: quota importing billing's domain event via alias.
			write(join(tmpRoot, 'quota', 'handlers', 'BadAliasHandler.ts'), `import { InvoicePaidEvent } from '@billing/events'\n`)
			// Offender 2: quota importing billing's domain event via relative path.
			write(
				join(tmpRoot, 'quota', 'handlers', 'BadRelativeHandler.ts'),
				`import { InvoicePaidEvent } from '../../billing/events/InvoicePaidEvent'\n`,
			)
			// Fine: billing importing its OWN events (alias + relative) and the contracts binding.
			write(
				join(tmpRoot, 'billing', 'handlers', 'GoodHandler.ts'),
				`import { InvoicePaidEvent } from '@billing/events'\n` +
					`import { InvoicePaidEvent as E2 } from '../events/InvoicePaidEvent'\n` +
					`import { SubscriptionChangedEvent } from '@codm/contracts-typescript/wire/events'\n`,
			)
			const crossHits = scanCrossContextEventImports(tmpRoot)
			expect(crossHits.map(v => v.file).sort()).toEqual(['quota/handlers/BadAliasHandler.ts', 'quota/handlers/BadRelativeHandler.ts'])

			// Offender 3: an integration event authored in src.
			write(join(tmpRoot, 'billing', 'events', 'BadIntegrationEvent.ts'), `export const S = z.integrationEvent({ ownerId: z.string() })\n`)
			const authoringHits = scanIntegrationAuthoring(tmpRoot)
			expect(authoringHits.map(v => v.file)).toEqual(['billing/events/BadIntegrationEvent.ts'])
		} finally {
			rmSync(tmpRoot, { recursive: true, force: true })
		}
	})
})
