// Pre-computed indexes for fast queries — written next to graph.json.
// Avoids re-walking the graph on every CLI invocation.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { GRAPH_OUT } from './paths'
import type { Edge, Graph, Node } from './graph'
import { join } from 'node:path'

export const INDEX_JSON = join(GRAPH_OUT, 'index.json')

export interface SerializedIndex {
	version: string
	generatedAt: string
	// node id → file path (only nodes that have a location)
	byFile: Record<string, string[]> // file path → node ids
	// node id → edges where it's the source
	outEdges: Record<string, string[]> // node id → edge ids
	// node id → edges where it's the target
	inEdges: Record<string, string[]>
	// kind → node ids
	byKind: Record<string, string[]>
	// edge id → from + to + kind + audit (denormalized for direct lookup)
	edgesById: Record<string, { from: string; to: string; kind: string; audit: string }>
}

export function buildIndex(graph: Graph): SerializedIndex {
	const byFile: Record<string, string[]> = {}
	const outEdges: Record<string, string[]> = {}
	const inEdges: Record<string, string[]> = {}
	const byKind: Record<string, string[]> = {}
	const edgesById: SerializedIndex['edgesById'] = {}

	for (const node of graph.nodes.values()) {
		// by file
		const file = node.location?.file
		if (file) {
			const arr = byFile[file] ?? []
			arr.push(node.id)
			byFile[file] = arr
		}
		// by kind
		const arr = byKind[node.kind] ?? []
		arr.push(node.id)
		byKind[node.kind] = arr
	}

	for (const edge of graph.edges) {
		edgesById[edge.id] = { from: edge.from, to: edge.to, kind: edge.kind, audit: edge.audit }
		const out = outEdges[edge.from] ?? []
		out.push(edge.id)
		outEdges[edge.from] = out
		const inn = inEdges[edge.to] ?? []
		inn.push(edge.id)
		inEdges[edge.to] = inn
	}

	return {
		version: '1',
		generatedAt: new Date().toISOString(),
		byFile,
		outEdges,
		inEdges,
		byKind,
		edgesById,
	}
}

export function writeIndex(index: SerializedIndex): void {
	mkdirSync(dirname(INDEX_JSON), { recursive: true })
	writeFileSync(INDEX_JSON, JSON.stringify(index))
}

export function loadIndex(): SerializedIndex | null {
	if (!existsSync(INDEX_JSON)) return null
	return JSON.parse(readFileSync(INDEX_JSON, 'utf8')) as SerializedIndex
}

// Lightweight loader that reads only what you need. We still parse the full
// graph.json for node metadata, but the index gives O(1) edge lookups.
export interface FastQueryContext {
	graph: Graph
	index: SerializedIndex
}

export function neighborsOf(ctx: FastQueryContext, nodeId: string): { incoming: Edge[]; outgoing: Edge[] } {
	const inIds = ctx.index.inEdges[nodeId] ?? []
	const outIds = ctx.index.outEdges[nodeId] ?? []
	const incoming: Edge[] = []
	const outgoing: Edge[] = []
	for (const eid of inIds) {
		const ref = ctx.index.edgesById[eid]
		if (!ref) continue
		incoming.push({ id: eid, from: ref.from, to: ref.to, kind: ref.kind as Edge['kind'], audit: ref.audit as Edge['audit'] })
	}
	for (const eid of outIds) {
		const ref = ctx.index.edgesById[eid]
		if (!ref) continue
		outgoing.push({ id: eid, from: ref.from, to: ref.to, kind: ref.kind as Edge['kind'], audit: ref.audit as Edge['audit'] })
	}
	return { incoming, outgoing }
}

export function nodeByFile(ctx: FastQueryContext, file: string): Node[] {
	const ids = ctx.index.byFile[file] ?? []
	return ids.map(id => ctx.graph.nodes.get(id)).filter((n): n is Node => Boolean(n))
}

// BFS in either direction, capped at maxDepth. Returns visited edges in order.
export function traverse(
	ctx: FastQueryContext,
	rootId: string,
	direction: 'upstream' | 'downstream',
	maxDepth = 4,
): { nodes: string[]; edges: string[] } {
	const visited = new Set<string>([rootId])
	const edges: string[] = []
	const queue: { id: string; depth: number }[] = [{ id: rootId, depth: 0 }]
	while (queue.length > 0) {
		const head = queue.shift()!
		if (head.depth >= maxDepth) continue
		const idsList = direction === 'upstream' ? ctx.index.inEdges[head.id] : ctx.index.outEdges[head.id]
		for (const eid of idsList ?? []) {
			edges.push(eid)
			const ref = ctx.index.edgesById[eid]
			if (!ref) continue
			const next = direction === 'upstream' ? ref.from : ref.to
			if (visited.has(next)) continue
			visited.add(next)
			queue.push({ id: next, depth: head.depth + 1 })
		}
	}
	return { nodes: [...visited], edges }
}
