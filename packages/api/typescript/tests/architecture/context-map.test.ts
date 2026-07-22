import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve, dirname } from 'node:path'
import { CONTEXTS, FOREIGN_PGSCHEMAS, PENDING_PGSCHEMAS } from '@shared/contexts'
import { CONTEXT_MAP, CROSS_CONTEXT_POLICY, AMBIENT, POLICY_EXCEPTIONS, ANNOTATED_CYCLES, BOOTSTRAP_FILES } from '@shared/context-map'

/**
 * Context-map guard — enforces the DECLARED context map (src/shared/context-map.ts) against the
 * real imports. Intent precedes derivation: an import crossing contexts is legal iff
 *   (a) the supplier is AMBIENT for that surface, or
 *   (b) the edge consumer→supplier is declared in CONTEXT_MAP AND the imported surface is allowed
 *       by CROSS_CONTEXT_POLICY (or carries a NAMED policy exception), or
 *   (c) the file is a composition-root BOOTSTRAP file (aggregates every context by design).
 *
 * Also gated here: policy-exception LIVENESS (a fossil exception fails), cycle ANNOTATION (any
 * declared 2-cycle must be a conscious partnership), edge liveness (declared-but-unused edge only
 * warns), and CONTEXTS↔contracts pgSchema PARITY.
 */

const API_SRC = join(import.meta.dir, '..', '..', 'src')
const CONTRACTS_SCHEMA = join(import.meta.dir, '..', '..', '..', '..', 'contracts', 'db', 'schema')
const MODULES = Object.keys(CONTEXTS)

const ALIAS_IMPORT_RE = /from '@([a-z-]+)\/([a-z0-9-]+)/g
const RELATIVE_IMPORT_RE = /from '(\.\.?\/[^']*)'/g

interface Edge {
	file: string
	line: number
	consumer: string
	supplier: string
	surface: string
	text: string
}

function listSourceFiles(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name)
		if (entry.isDirectory()) {
			if (entry.name === 'node_modules') continue
			listSourceFiles(full, out)
		} else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
			out.push(full)
		}
	}
	return out
}

/** Every cross-context import edge in src (alias @ctx/* + resolved relative), non-test files. */
function collectEdges(): Edge[] {
	const edges: Edge[] = []
	for (const file of listSourceFiles(API_SRC)) {
		const rel = relative(API_SRC, file).split('\\').join('/')
		if (BOOTSTRAP_FILES.includes(rel)) continue
		const consumer = rel.split('/')[0] ?? ''
		if (!MODULES.includes(consumer)) continue
		const lines = readFileSync(file, 'utf8').split('\n')
		lines.forEach((lineText, idx) => {
			for (const m of lineText.matchAll(ALIAS_IMPORT_RE)) {
				const [, supplier, surface] = m
				if (supplier && surface && MODULES.includes(supplier) && supplier !== consumer) {
					edges.push({ file: rel, line: idx + 1, consumer, supplier, surface, text: lineText.trim() })
				}
			}
			for (const m of lineText.matchAll(RELATIVE_IMPORT_RE)) {
				const resolved = relative(API_SRC, resolve(dirname(file), m[1] ?? '')).split('\\').join('/')
				if (resolved.startsWith('..')) continue
				const [supplier, surface] = resolved.split('/')
				if (supplier && surface && MODULES.includes(supplier) && supplier !== consumer) {
					edges.push({ file: rel, line: idx + 1, consumer, supplier, surface, text: lineText.trim() })
				}
			}
		})
	}
	return edges
}

const isAmbient = (supplier: string, surface: string): boolean => {
	const decl = (AMBIENT as Record<string, readonly string[] | '*'>)[supplier]
	return decl === '*' || (Array.isArray(decl) && decl.includes(surface))
}

const hasException = (edge: Edge): boolean =>
	POLICY_EXCEPTIONS.some(e => e.file === edge.file && edge.text.includes(e.imports))

describe('context-map (declared intent map + global surface policy over real imports)', () => {
	const edges = collectEdges()

	test('every cross-context import has a declared edge (or ambient supplier)', () => {
		const undeclared = edges.filter(e => {
			if (isAmbient(e.supplier, e.surface)) return false
			const map = CONTEXT_MAP as Record<string, Record<string, unknown> | undefined>
			return map[e.consumer]?.[e.supplier] === undefined
		})
		const report = undeclared.map(e => `  ${e.file}:${e.line}  ${e.consumer} → ${e.supplier}/${e.surface}`).join('\n')
		expect(
			undeclared.length,
			`Cross-context import without a declared edge — dependencies are DECISIONS: add the edge to ` +
				`CONTEXT_MAP (src/shared/context-map.ts) with a note, or route through an ambient/contract ` +
				`surface:\n${report}`,
		).toBe(0)
	})

	test('no forbidden surface crosses a boundary (CROSS_CONTEXT_POLICY) without a named exception', () => {
		const violations = edges.filter(
			e => (CROSS_CONTEXT_POLICY.forbidden as readonly string[]).includes(e.surface) && !hasException(e),
		)
		const report = violations.map(e => `  ${e.file}:${e.line}  ${e.consumer} → ${e.supplier}/${e.surface}`).join('\n')
		expect(
			violations.length,
			`Forbidden surface imported across contexts (entities = write-model leak; usecases = ` +
				`cross-context orchestration; handlers/events/jobs = wiring). Refactor to repositories/` +
				`services, or add a NAMED PolicyException with a why:\n${report}`,
		).toBe(0)
	})

	test('policy exceptions are ALIVE (file exists and still contains the import)', () => {
		const dead = POLICY_EXCEPTIONS.filter(e => {
			const full = join(API_SRC, e.file)
			return !existsSync(full) || !readFileSync(full, 'utf8').includes(e.imports)
		})
		expect(
			dead.map(e => e.file),
			'Fossil policy exception — the file/import it excuses no longer exists. Remove the entry.',
		).toEqual([])
	})

	test('every declared 2-cycle is an annotated partnership', () => {
		const map = CONTEXT_MAP as Record<string, Record<string, unknown> | undefined>
		const cycles: string[] = []
		for (const a of MODULES) {
			for (const b of MODULES) {
				if (a < b && map[a]?.[b] !== undefined && map[b]?.[a] !== undefined) {
					const annotated = ANNOTATED_CYCLES.some(
						c => (c.between[0] === a && c.between[1] === b) || (c.between[0] === b && c.between[1] === a),
					)
					if (!annotated) cycles.push(`${a} ↔ ${b}`)
				}
			}
		}
		expect(cycles, 'Un-annotated dependency cycle — either break it or declare it in ANNOTATED_CYCLES with a why.').toEqual([])
	})

	test('liveness: declared edges without any live import are reported (warning only)', () => {
		const map = CONTEXT_MAP as Record<string, Record<string, unknown> | undefined>
		const unused: string[] = []
		for (const [consumer, suppliers] of Object.entries(map)) {
			for (const supplier of Object.keys(suppliers ?? {})) {
				if (!edges.some(e => e.consumer === consumer && e.supplier === supplier)) unused.push(`${consumer} → ${supplier}`)
			}
		}
		if (unused.length > 0) console.warn(`[context-map] declared edges with no live import (consider pruning): ${unused.join(', ')}`)
		expect(true).toBe(true)
	})

	test('pgSchema parity: declared CONTEXTS pgSchemas == contracts/db/schema pgSchema() literals', () => {
		const declared: string[] = [
			...Object.values(CONTEXTS).flatMap(c => (c.pgSchema === null ? [] : [c.pgSchema as string])),
			// Schemas owned by non-TS backends — declared in the same spine (intent precedes derivation).
			...FOREIGN_PGSCHEMAS,
			// TS-owned schemas forward-declared by the contract lock, ahead of their context build-out.
			...PENDING_PGSCHEMAS,
		].sort()
		const inContracts = readdirSync(CONTRACTS_SCHEMA)
			.filter(f => f.endsWith('.ts') && f !== 'index.ts')
			.flatMap(f => [...readFileSync(join(CONTRACTS_SCHEMA, f), 'utf8').matchAll(/pgSchema\('([a-z_]+)'\)/g)].map(m => m[1] ?? ''))
			.filter(Boolean)
			.sort()
		expect(
			{ declared, inContracts },
			'CONTEXTS.pgSchema and the contracts schema files drifted — a context owns exactly the schema it declares.',
		).toEqual({ declared, inContracts: declared })
	})

	// Negative fixture — proves collectEdges + the checks catch an offender shape.
	test('fixture: a synthetic forbidden edge is classified correctly', () => {
		const fake: Edge = { file: 'quota/services/X.ts', line: 1, consumer: 'quota', supplier: 'billing', surface: 'entities', text: "import { Invoice } from '@billing/entities'" }
		expect((CROSS_CONTEXT_POLICY.forbidden as readonly string[]).includes(fake.surface)).toBe(true)
		expect(hasException(fake)).toBe(false)
		expect(isAmbient(fake.supplier, fake.surface)).toBe(false)
	})
})
