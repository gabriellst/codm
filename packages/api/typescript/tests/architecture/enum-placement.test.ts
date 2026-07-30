import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

/**
 * Enum-placement guard (CMPL-01 + CMPL-02) — the mechanical rail behind the enum→contracts canon.
 *
 * A CROSS-BOUNDARY enum (one the DB schema persists, or the wire carries, or the Go side reads) is
 * DEFINED ONCE, in `packages/contracts` TypeSpec, and consumed everywhere from the generated binding
 * (`@codedm/contracts-typescript/wire/enums`). It must NOT exist a second time as:
 *   - an inline string-literal union inside `contracts/db/schema/*.ts` (the drift-prone "mirror" —
 *     `type BillingPlatform = 'PAGARME' | 'STRIPE' | …` kept "in sync by hand"), nor
 *   - an `export enum X` inside `src/**\/enums` (which would let the API define its own copy of a
 *     type the DB/wire also defines — exactly the divergence the migration removed).
 *
 * Two independent source-text scans (molde `console-discipline.test.ts` — a grep, not an AST parse):
 *   CMPL-01 — no top-level `type X = 'a' | 'b'` string-union alias in a contracts db-schema file.
 *   CMPL-02 — no `export enum <CrossBoundaryEnum>` under `src/**\/enums`.
 *
 * Context-local enums (BillingWebhookSource, InvoiceStatus, RefundBasis, RefundSource — none
 * persisted/wire) legitimately stay in `src/billing/enums`; API-internal shared enums
 * (IdempotencyScope — never schema/wire) stay in `src/shared/enums`. Only the enums the
 * DB schema / wire actually reference are governed here (OwnerKind moved to contracts once it was
 * confirmed persisted on owner.owners.kind).
 *
 * Lives in `tests/architecture/` — the shared home for repo-wide mechanical detectors.
 */

// The cross-boundary enum set is DERIVED by importing the generated wire binding itself — "exists
// in contracts" IS the definition of cross-boundary, so the guard can never lag the contract (the
// old hand list guarded 15 of 24 wire enums; an api-side `export enum Role` passed clean). A new
// contracts enum is guarded in the same commit that generates it, with zero list maintenance.
import * as WireEnums from '@codedm/contracts-typescript/wire/enums'
const CROSS_BOUNDARY_ENUMS = Object.keys(WireEnums).filter(k => /^[A-Z]/.test(k))

const API_SRC = join(import.meta.dir, '..', '..', 'src')
const CONTRACTS_SCHEMA = join(import.meta.dir, '..', '..', '..', '..', 'contracts', 'db', 'schema')

// Non-table files in the schema dir — the barrel, the CHECK-constraint helper (`enumCheck`) and the
// drizzle-kit config. They declare no table, so scanning them widens CMPL-01 past what it guards.
const SCHEMA_NON_TABLE_FILES = new Set(['index.ts', '_enum.ts', 'drizzle.config.ts'])

// A top-level `type Name = 'lit' | 'lit' …` string-literal union alias — the mirror shape. A branded
// single alias (`type QuotaKey = string`) is deliberately NOT matched (it names no members), and a
// string union nested inside an object type (`kind: 'A' | 'B'` field) is not a top-level alias.
const STRING_UNION_MIRROR_RE = /^type\s+([A-Za-z0-9_]+)\s*=\s*'[^']*'(?:\s*\|\s*'[^']*')*\s*;?\s*$/

// No exemptions: every enum the contracts DB schema persists is single-sourced from the wire binding.
// (The former `Language` exception is gone — the billing ISO language was unified into the single
// contracts `Language` wire enum, so its mirror was killed too.)
const CMPL01_EXEMPT_TYPES = new Set<string>()

const ENUM_DEF_RE = (name: string) => new RegExp(`^\\s*export\\s+enum\\s+${name}\\b`)

interface Violation {
	file: string
	line: number
	text: string
}

function listSchemaFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true })
		.filter(e => e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') && !SCHEMA_NON_TABLE_FILES.has(e.name))
		.map(e => join(dir, e.name))
}

function listEnumDirFiles(dir: string): string[] {
	const out: string[] = []
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name)
		if (entry.isDirectory()) {
			if (entry.name === 'node_modules') continue
			out.push(...listEnumDirFiles(full))
		} else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && full.split('/').includes('enums')) {
			out.push(full)
		}
	}
	return out
}

/** CMPL-01: mirror string-union aliases in contracts db-schema files, minus exemptions. */
function scanSchemaMirrors(root: string): Violation[] {
	const violations: Violation[] = []
	for (const file of listSchemaFiles(root)) {
		const rel = relative(root, file)
		readFileSync(file, 'utf8')
			.split('\n')
			.forEach((lineText, idx) => {
				const m = lineText.match(STRING_UNION_MIRROR_RE)
				if (m?.[1] !== undefined && !CMPL01_EXEMPT_TYPES.has(m[1])) {
					violations.push({ file: rel, line: idx + 1, text: lineText.trim() })
				}
			})
	}
	return violations
}

/** CMPL-02: `export enum <CrossBoundaryEnum>` anywhere under an `enums/` dir in src. */
function scanSrcEnumDefs(root: string): Violation[] {
	const violations: Violation[] = []
	const res = CROSS_BOUNDARY_ENUMS.map(n => ({ n, re: ENUM_DEF_RE(n) }))
	for (const file of listEnumDirFiles(root)) {
		const rel = relative(root, file).split('\\').join('/')
		const lines = readFileSync(file, 'utf8').split('\n')
		lines.forEach((lineText, idx) => {
			for (const { re } of res) {
				if (re.test(lineText)) violations.push({ file: rel, line: idx + 1, text: lineText.trim() })
			}
		})
	}
	return violations
}

describe('enum-placement (cross-boundary enums live only in contracts, never mirrored in src/schema)', () => {
	test('CMPL-01: no inline string-literal enum mirror in contracts/db/schema', () => {
		// Non-vacuity first: a green scan over ZERO files is the failure mode this rail cannot have
		// (it is exactly what a stale CONTRACTS_SCHEMA path would produce). 9 namespace files today.
		const scanned = listSchemaFiles(CONTRACTS_SCHEMA)
		expect(scanned.length, 'CMPL-01 scanned no contracts schema file — the path went stale, the rail is vacuous.').toBeGreaterThanOrEqual(9)

		const violations = scanSchemaMirrors(CONTRACTS_SCHEMA)
		const report = violations.map(v => `  ${v.file}:${v.line}  →  ${v.text}`).join('\n')
		expect(
			violations.length,
			`Contracts DB schema mirrors an enum as an inline string-literal union — import the enum from the ` +
				`generated binding ('@codedm/contracts-typescript/wire/enums') and bind the value-set ON THE COLUMN ` +
				`with text() + .$type<Enum>() + enumCheck(...) (a CHECK constraint), never with a hand-written ` +
				`literal union. .$type<>() alone types the TS side and leaves the database unconstrained:\n${report}`,
		).toBe(0)
	})

	test('CMPL-02: no cross-boundary enum is defined (export enum) under src/**/enums', () => {
		const violations = scanSrcEnumDefs(API_SRC)
		const report = violations.map(v => `  ${v.file}:${v.line}  →  ${v.text}`).join('\n')
		expect(
			violations.length,
			`A cross-boundary enum (persisted by the DB schema / carried on the wire) is defined in src — ` +
				`it must live ONLY in packages/contracts TypeSpec and be imported from ` +
				`'@codedm/contracts-typescript/wire/enums'. Move it to contracts (bun contracts) and delete the ` +
				`src copy:\n${report}`,
		).toBe(0)
	})

	// Negative fixtures — prove each scan actually catches an offender (temp dir, not the real tree).
	test('fixture: a mirror union alias and a src enum def are flagged; a branded alias is not', () => {
		const tmpRoot = mkdtempSync(join(tmpdir(), 'enum-placement-fixture-'))
		const write = (p: string, c: string) => {
			mkdirSync(p.slice(0, p.lastIndexOf('/')), { recursive: true })
			writeFileSync(p, c)
		}
		try {
			// CMPL-01 fixture: a mirror string-union is flagged; a branded single alias (= string) is not.
			const schemaDir = join(tmpRoot, 'schema')
			write(join(schemaDir, 'billing.ts'), `type BillingPlatform = 'PAGARME' | 'STRIPE'\ntype QuotaKey = string\n`)
			const mirrorHits = scanSchemaMirrors(schemaDir)
			expect(mirrorHits.map(v => v.text)).toEqual([`type BillingPlatform = 'PAGARME' | 'STRIPE'`])

			// CMPL-02 fixture: a cross-boundary enum def is flagged; a context-local one is not.
			// CurrencyCode is a live contracts wire enum; InvoiceStatus is not, so only the former mirrors.
			const enumsDir = join(tmpRoot, 'owner', 'enums')
			write(join(enumsDir, 'CurrencyCode.ts'), `export enum CurrencyCode {\n\tUSD = 'USD',\n}\n`)
			write(join(enumsDir, 'InvoiceStatus.ts'), `export enum InvoiceStatus {\n\tOPEN = 'OPEN',\n}\n`)
			const enumHits = scanSrcEnumDefs(tmpRoot)
			expect(enumHits.map(v => v.file)).toEqual(['owner/enums/CurrencyCode.ts'])
		} finally {
			rmSync(tmpRoot, { recursive: true, force: true })
		}
	})
})
