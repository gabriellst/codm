// Contracts adapter — emits `contract-enum`, `contract-event`, and
// `contract-table` nodes from packages/contracts.
//
// Source of truth is TypeSpec under `wire/{enums,events}/*.tsp`. We use a
// regex parser rather than depending on the TypeSpec compiler, because the
// shapes are tightly bounded and the generated TS already mirrors them
// faithfully — the adapter only needs to enumerate which contracts exist.
//
// Drizzle tables under `db/schema/*.ts` are picked up by the legacy drizzle
// extractor today (Phase 2 retargeted it to contracts). That coverage remains
// in place; this adapter adds the wire layer.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { addEdge, addNode, contractId, edgeId, type Graph } from '../../core/graph'
import type { AuditCollector } from '../../core/audit'
import { ROOT, repoRelative } from '../../core/paths'
import { WIRE_ENUMS_DIR, WIRE_EVENTS_DIR } from '../../core/config'

export interface ContractsExtractionStats {
	enumsExtracted: number
	eventsExtracted: number
	unionsExtracted: number
	generatedLinked: number
}

export function runContractsExtraction(graph: Graph, _audit: AuditCollector): ContractsExtractionStats {
	const enumsExtracted = extractEnums(graph)
	const eventsExtracted = extractEvents(graph)
	const unionsExtracted = extractUnions(graph)
	const generatedLinked = linkGeneratedArtifacts(graph)
	return { enumsExtracted, eventsExtracted, unionsExtracted, generatedLinked }
}

// ── Enum extraction ──────────────────────────────────────────────────────────

function extractEnums(graph: Graph): number {
	const enumsAbs = join(ROOT, WIRE_ENUMS_DIR)
	if (!existsSync(enumsAbs)) return 0
	let count = 0
	for (const file of readdirSync(enumsAbs)) {
		if (!file.endsWith('.tsp')) continue
		const path = join(enumsAbs, file)
		const text = readFileSync(path, 'utf8')
		const repoPath = repoRelative(path)
		// Match: `enum <Name> { ... }`
		const enumRe = /enum\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{([\s\S]*?)\}/g
		for (const match of text.matchAll(enumRe)) {
			const name = match[1]!
			const body = match[2]!
			const members = [...body.matchAll(/([A-Z][A-Z0-9_]*)\s*:/g)].map(mm => mm[1]!)
			const id = contractId('contract-enum', name)
			addNode(graph, {
				id,
				kind: 'contract-enum',
				name,
				service: 'contracts',
				workspace: 'contracts',
				location: { file: repoPath },
				metadata: { members, sourceFile: file },
			})
			count++
		}
	}
	return count
}

// ── Event extraction ─────────────────────────────────────────────────────────

function extractEvents(graph: Graph): number {
	const eventsAbs = join(ROOT, WIRE_EVENTS_DIR)
	if (!existsSync(eventsAbs)) return 0
	let count = 0
	for (const file of readdirSync(eventsAbs)) {
		if (!file.endsWith('.tsp')) continue
		if (file === '_base.tsp' || file === 'index.tsp') continue
		const path = join(eventsAbs, file)
		const text = readFileSync(path, 'utf8')
		const repoPath = repoRelative(path)
		// Match: `model <Name> extends IntegrationEvent { ... }` with a `name:` literal.
		const modelRe = /model\s+([A-Za-z_][A-Za-z0-9_]*)\s+extends\s+IntegrationEvent\s*\{([\s\S]*?)\}/g
		for (const match of text.matchAll(modelRe)) {
			const modelName = match[1]!
			const body = match[2]!
			const nameLit = body.match(/name\s*:\s*"([^"]+)"/)?.[1]
			const id = contractId('contract-event', nameLit ?? modelName)
			addNode(graph, {
				id,
				kind: 'contract-event',
				name: nameLit ?? modelName,
				service: 'contracts',
				workspace: 'contracts',
				location: { file: repoPath },
				metadata: { modelName, wireName: nameLit, sourceFile: file },
			})
			count++
		}
	}
	return count
}

// ── Union extraction ─────────────────────────────────────────────────────────
// Wire unions are declared by the codegen output (no .tsp source today). We
// parse the TS-generated `wire/unions/*.ts` files, where each union is shaped
// `export const <Name>Schema = z.union([z.enum(A), z.enum(B), ...])`. One
// `contract-union` node + `has-variant` edges to each component enum.

function extractUnions(graph: Graph): number {
	const unionsAbs = join(ROOT, 'packages/contracts/generated/typescript/src/wire/unions')
	if (!existsSync(unionsAbs)) return 0
	let count = 0
	for (const file of readdirSync(unionsAbs)) {
		if (!file.endsWith('.ts') || file === 'index.ts') continue
		const path = join(unionsAbs, file)
		const text = readFileSync(path, 'utf8')
		const repoPath = repoRelative(path)
		// `export const PlatformSchema = z.union([z.enum(SalesPlatform), z.enum(CheckoutPlatform), ...])`
		const unionRe = /export\s+const\s+([A-Z][A-Za-z0-9_]*)Schema\s*=\s*z\.union\(\[([\s\S]*?)\]\)/g
		for (const match of text.matchAll(unionRe)) {
			const name = match[1]!
			const body = match[2]!
			const variants = [...body.matchAll(/z\.enum\(([A-Z][A-Za-z0-9_]*)\)/g)].map(mm => mm[1]!)
			const id = contractId('contract-union', name)
			addNode(graph, {
				id,
				kind: 'contract-union',
				name,
				service: 'contracts',
				workspace: 'contracts',
				location: { file: repoPath },
				metadata: { variants, sourceFile: file },
			})
			for (const variant of variants) {
				const variantId = contractId('contract-enum', variant)
				if (!graph.nodes.has(variantId)) continue
				addEdge(graph, {
					id: edgeId(id, 'has-variant', variantId),
					from: id,
					to: variantId,
					kind: 'has-variant',
					audit: 'EXTRACTED',
				})
			}
			count++
		}
	}
	return count
}

// ── Generated artifact linking ───────────────────────────────────────────────
// Emit one `generated-*` node per top-level symbol in each per-language output
// and link it back to the contract node. The previous implementation emitted
// one node per FILE — fine for TypeScript where codegen produces one file per
// symbol, but broken for Go where `enums.go`/`events.go`/`unions.go` bulk-emit
// many types into a single file (→ 3 nodes instead of ~90).

function linkGeneratedArtifacts(graph: Graph): number {
	let count = 0
	count += linkGeneratedTypescript(graph)
	count += linkGeneratedGo(graph)
	return count
}

// ── TS side: one file per symbol (already canonical), match by Pascal basename
//   for enums, and by extracted wire-name `static readonly name = '…'` for events.

function linkGeneratedTypescript(graph: Graph): number {
	const tsRoot = join(ROOT, 'packages/contracts/generated/typescript/src/wire')
	if (!existsSync(tsRoot)) return 0
	let count = 0
	for (const file of walkFiles(tsRoot)) {
		const fileName = file.split('/').pop() ?? ''
		const baseNoExt = fileName.replace(/\.ts$/, '')
		if (baseNoExt === 'index' || baseNoExt === '_imports') continue
		const repoPath = repoRelative(file)
		const isEnum = file.includes('/wire/enums/')
		const isEvent = file.includes('/wire/events/')
		const isUnion = file.includes('/wire/unions/')
		if (!isEnum && !isEvent && !isUnion) continue

		const pascalName = toPascalCase(baseNoExt)
		const id = `contracts-generated-ts:generated-typescript:${pascalName}`
		addNode(graph, {
			id,
			kind: 'generated-typescript',
			name: pascalName,
			service: 'contracts',
			workspace: 'contracts-generated-ts',
			location: { file: repoPath },
			metadata: { generatedFrom: 'contracts' },
		})

		const targets: string[] = []
		if (isEnum) targets.push(contractId('contract-enum', pascalName))
		if (isUnion) targets.push(contractId('contract-union', pascalName))
		if (isEvent) {
			const text = readFileSync(file, 'utf8')
			// `static override readonly name = 'integration.shared.foo.bar' as const`
			const wireName = text.match(/static\s+(?:override\s+)?readonly\s+name\s*=\s*['"]([^'"]+)['"]/)?.[1]
			if (wireName) targets.push(contractId('contract-event', wireName))
		}
		for (const targetId of targets) {
			if (!graph.nodes.has(targetId)) continue
			addEdge(graph, {
				id: edgeId(id, 'generated-from', targetId),
				from: id,
				to: targetId,
				kind: 'generated-from',
				audit: 'GENERATED',
			})
			count++
		}
	}
	return count
}

// ── Go side: bulk-emitted `enums.go`/`events.go`/`unions.go` — parse top-level
//   `type X ...` declarations and emit one node per symbol.

function linkGeneratedGo(graph: Graph): number {
	const goRoot = join(ROOT, 'packages/contracts/generated/go/wire')
	if (!existsSync(goRoot)) return 0
	let count = 0

	count += parseGoEnumFile(graph, join(goRoot, 'enums.go'))
	count += parseGoEventFile(graph, join(goRoot, 'events.go'))
	count += parseGoUnionFile(graph, join(goRoot, 'unions.go'))

	return count
}

function parseGoEnumFile(graph: Graph, abs: string): number {
	if (!existsSync(abs)) return 0
	const text = readFileSync(abs, 'utf8')
	const repoPath = repoRelative(abs)
	let count = 0
	// `type AdSpendGroupBy string`
	for (const match of text.matchAll(/^type\s+([A-Z][A-Za-z0-9_]*)\s+string\s*$/gm)) {
		const name = match[1]!
		const id = `contracts-generated-go:generated-go:${name}`
		addNode(graph, {
			id,
			kind: 'generated-go',
			name,
			service: 'contracts',
			workspace: 'contracts-generated-go',
			location: { file: repoPath },
			metadata: { generatedFrom: 'contracts', category: 'enum' },
		})
		const targetId = contractId('contract-enum', name)
		if (graph.nodes.has(targetId)) {
			addEdge(graph, {
				id: edgeId(id, 'generated-from', targetId),
				from: id,
				to: targetId,
				kind: 'generated-from',
				audit: 'GENERATED',
			})
			count++
		}
	}
	return count
}

function parseGoEventFile(graph: Graph, abs: string): number {
	if (!existsSync(abs)) return 0
	const text = readFileSync(abs, 'utf8')
	const repoPath = repoRelative(abs)
	let count = 0
	// Pair `const FooEventName = "integration.shared.foo.bar"` with `type FooEvent struct {…}`.
	const wireNames = new Map<string, string>()
	for (const m of text.matchAll(/^const\s+([A-Z][A-Za-z0-9_]*)Name\s*=\s*"([^"]+)"\s*$/gm)) {
		wireNames.set(m[1]!, m[2]!)
	}
	for (const match of text.matchAll(/^type\s+([A-Z][A-Za-z0-9_]*Event)\s+struct\s*\{/gm)) {
		const name = match[1]!
		const id = `contracts-generated-go:generated-go:${name}`
		addNode(graph, {
			id,
			kind: 'generated-go',
			name,
			service: 'contracts',
			workspace: 'contracts-generated-go',
			location: { file: repoPath },
			metadata: { generatedFrom: 'contracts', category: 'event', wireName: wireNames.get(name) },
		})
		const wireName = wireNames.get(name)
		if (wireName) {
			const targetId = contractId('contract-event', wireName)
			if (graph.nodes.has(targetId)) {
				addEdge(graph, {
					id: edgeId(id, 'generated-from', targetId),
					from: id,
					to: targetId,
					kind: 'generated-from',
					audit: 'GENERATED',
				})
				count++
			}
		}
	}
	return count
}

function parseGoUnionFile(graph: Graph, abs: string): number {
	if (!existsSync(abs)) return 0
	const text = readFileSync(abs, 'utf8')
	const repoPath = repoRelative(abs)
	let count = 0
	// `type Platform string` preceded by a `// @oneof values=A,B,C` doc comment.
	for (const match of text.matchAll(/^type\s+([A-Z][A-Za-z0-9_]*)\s+string\s*$/gm)) {
		const name = match[1]!
		const id = `contracts-generated-go:generated-go:${name}`
		addNode(graph, {
			id,
			kind: 'generated-go',
			name,
			service: 'contracts',
			workspace: 'contracts-generated-go',
			location: { file: repoPath },
			metadata: { generatedFrom: 'contracts', category: 'union' },
		})
		const targetId = contractId('contract-union', name)
		if (graph.nodes.has(targetId)) {
			addEdge(graph, {
				id: edgeId(id, 'generated-from', targetId),
				from: id,
				to: targetId,
				kind: 'generated-from',
				audit: 'GENERATED',
			})
			count++
		}
	}
	return count
}

function walkFiles(dir: string): string[] {
	const out: string[] = []
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry)
		const st = statSync(full)
		if (st.isDirectory()) {
			out.push(...walkFiles(full))
		} else if (st.isFile()) {
			out.push(full)
		}
	}
	return out
}

function toPascalCase(s: string): string {
	return s
		.split(/[-_]/)
		.filter(Boolean)
		.map(part => part.charAt(0).toUpperCase() + part.slice(1))
		.join('')
}
