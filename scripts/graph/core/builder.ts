import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { runOpenApiExtraction } from '../adapters/openapi'
import { runBackendExtraction } from '../adapters/ts/extractors/backend'
import { runDrizzleExtraction } from '../adapters/ts/extractors/drizzle'
import { runFrontendExtraction } from '../adapters/ts/extractors/frontend'
import { runLocaleExtraction } from '../adapters/ts/extractors/locale'
import { runGoExtraction } from '../adapters/go'
import { runContractsExtraction } from '../adapters/contracts'
import { runAstroExtraction } from '../adapters/astro'
import { resolve } from '../resolver'
import { AuditCollector } from './audit'
import { newGraph, serializeGraph, type Graph } from './graph'
import { buildIndex, writeIndex } from './index-cache'
import { AUDIT_JSON, GRAPH_JSON, GRAPH_OUT } from './paths'

export interface BuildResult {
	graph: Graph
	audit: AuditCollector
	stats: {
		nodes: number
		edges: number
		extractor: {
			backend: number
			frontend: number
			drizzle: number
			astro: number
			locale: number
			openapi: number
			go: number
			contracts: { enums: number; events: number; unions: number; generatedLinked: number }
		}
		resolve: ReturnType<typeof resolve>
	}
}

export async function build(): Promise<BuildResult> {
	const graph = newGraph()
	const audit = new AuditCollector()

	const contracts = runContractsExtraction(graph, audit)
	const openapi = runOpenApiExtraction(graph, audit)
	const backend = runBackendExtraction(graph, audit)
	const drizzle = runDrizzleExtraction(graph, audit)
	const frontend = runFrontendExtraction(graph, audit)
	const astro = runAstroExtraction(graph, audit)
	const locale = runLocaleExtraction(graph, audit)
	const go = await runGoExtraction(graph, audit)
	const resolveStats = resolve(graph, audit)

	return {
		graph,
		audit,
		stats: {
			nodes: graph.nodes.size,
			edges: graph.edges.length,
			extractor: {
				backend: backend.filesProcessed,
				frontend: frontend.filesProcessed,
				drizzle: drizzle.tablesExtracted,
				astro: astro.filesProcessed,
				locale: locale.keysExtracted,
				openapi: openapi.totalOperations,
				go: go.filesProcessed,
				contracts: {
					enums: contracts.enumsExtracted,
					events: contracts.eventsExtracted,
					unions: contracts.unionsExtracted,
					generatedLinked: contracts.generatedLinked,
				},
			},
			resolve: resolveStats,
		},
	}
}

export function writeOutputs(result: BuildResult): void {
	mkdirSync(GRAPH_OUT, { recursive: true })
	mkdirSync(dirname(GRAPH_JSON), { recursive: true })
	const serialized = serializeGraph(result.graph)
	writeFileSync(GRAPH_JSON, JSON.stringify(serialized, null, 2))

	const auditReport = result.audit.finish({
		extracted: result.graph.edges.filter(e => e.audit === 'EXTRACTED').length,
		inferred: result.graph.edges.filter(e => e.audit === 'INFERRED').length,
		unresolved: result.audit.all.filter(a => a.code === 'UNRESOLVED_NODE' || a.code === 'UNRESOLVED_IMPORT').length,
	})
	writeFileSync(AUDIT_JSON, JSON.stringify(auditReport, null, 2))

	// Pre-built indexes for fast queries (adjacency, by-file, by-kind)
	const index = buildIndex(result.graph)
	writeIndex(index)
}
