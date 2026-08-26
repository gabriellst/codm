// Query primitives over the graph: why (upstream), impact (downstream), path, orphans.

import type { Edge, Graph, Node } from './graph'

export interface AdjacencyIndex {
	out: Map<string, Edge[]>
	in: Map<string, Edge[]>
}

export function buildAdjacency(graph: Graph): AdjacencyIndex {
	const out = new Map<string, Edge[]>()
	const inn = new Map<string, Edge[]>()
	for (const edge of graph.edges) {
		const arr = out.get(edge.from) ?? []
		arr.push(edge)
		out.set(edge.from, arr)
		const arr2 = inn.get(edge.to) ?? []
		arr2.push(edge)
		inn.set(edge.to, arr2)
	}
	return { out, in: inn }
}

export interface TraversalResult {
	root: Node
	tree: TreeNode
}

export interface TreeNode {
	node: Node
	via: Edge | null
	children: TreeNode[]
}

export function downstream(graph: Graph, adj: AdjacencyIndex, rootId: string, maxDepth = 4): TraversalResult | null {
	const root = graph.nodes.get(rootId)
	if (!root) return null
	const seen = new Set<string>([rootId])
	const tree = walk(graph, adj.out, rootId, null, seen, 0, maxDepth)
	return { root, tree }
}

export function upstream(graph: Graph, adj: AdjacencyIndex, rootId: string, maxDepth = 4): TraversalResult | null {
	const root = graph.nodes.get(rootId)
	if (!root) return null
	const seen = new Set<string>([rootId])
	const tree = walk(graph, adj.in, rootId, null, seen, 0, maxDepth, true)
	return { root, tree }
}

function walk(
	graph: Graph,
	adj: Map<string, Edge[]>,
	currentId: string,
	via: Edge | null,
	seen: Set<string>,
	depth: number,
	maxDepth: number,
	reversed = false,
): TreeNode {
	const node = graph.nodes.get(currentId)!
	const tree: TreeNode = { node, via, children: [] }
	if (depth >= maxDepth) return tree
	const edges = adj.get(currentId) ?? []
	for (const edge of edges) {
		const nextId = reversed ? edge.from : edge.to
		if (seen.has(nextId)) continue
		seen.add(nextId)
		tree.children.push(walk(graph, adj, nextId, edge, seen, depth + 1, maxDepth, reversed))
	}
	return tree
}

// BFS shortest path. Bidirectional by default — the graph has lots of edges that flow
// backend→SDK→frontend (e.g. controller `generates-sdk` operation), so a directional
// path from a frontend node to a DB table would never connect.
export interface PathStep {
	edge: Edge
	reversed: boolean
}

export function shortestPath(
	graph: Graph,
	adj: AdjacencyIndex,
	fromId: string,
	toId: string,
	options: { directed?: boolean } = {},
): PathStep[] | null {
	if (!graph.nodes.has(fromId) || !graph.nodes.has(toId)) return null
	const directed = options.directed ?? false
	const queue: { id: string; path: PathStep[] }[] = [{ id: fromId, path: [] }]
	const visited = new Set<string>([fromId])
	while (queue.length > 0) {
		const head = queue.shift()!
		if (head.id === toId) return head.path
		// Forward edges
		for (const edge of adj.out.get(head.id) ?? []) {
			if (visited.has(edge.to)) continue
			visited.add(edge.to)
			queue.push({ id: edge.to, path: [...head.path, { edge, reversed: false }] })
		}
		// Backward edges (only if undirected)
		if (!directed) {
			for (const edge of adj.in.get(head.id) ?? []) {
				if (visited.has(edge.from)) continue
				visited.add(edge.from)
				queue.push({ id: edge.from, path: [...head.path, { edge, reversed: true }] })
			}
		}
	}
	return null
}

// Kinds whose orphans are by-design and hidden from the default orphan report.
// Generated nested SDK types and dead translations don't indicate bugs.
const BY_DESIGN_ORPHAN_KINDS: ReadonlySet<string> = new Set([
	'sdk-type', // generated nested types not directly imported
	'sdk-zod', // generated nested zod schemas
	'sdk-http', // some operations are SSE/internal — http client unused
	'enum-member', // members of unused enums — fine
	'locale-key', // many translations are dead code (or referenced via patterns we miss)
])

export interface OrphanFilter {
	/** Include by-design orphans (SDK generated types, dead i18n keys). Default: false. */
	includeByDesign?: boolean
}

export function orphans(graph: Graph, adj: AdjacencyIndex, filter: OrphanFilter = {}): Node[] {
	const result: Node[] = []
	for (const node of graph.nodes.values()) {
		const outEdges = adj.out.get(node.id) ?? []
		const inEdges = adj.in.get(node.id) ?? []
		if (outEdges.length === 0 && inEdges.length === 0) {
			if (!filter.includeByDesign && BY_DESIGN_ORPHAN_KINDS.has(node.kind)) continue
			result.push(node)
		}
	}
	return result.sort((a, b) => a.id.localeCompare(b.id))
}

// Pretty-print a TreeNode as text
export function renderTree(tree: TreeNode, prefix = '', isLast = true): string {
	const lines: string[] = []
	const connector = isLast ? '└─ ' : '├─ '
	const viaLabel = tree.via ? ` [${tree.via.kind}${tree.via.audit === 'INFERRED' ? '*' : ''}]` : ''
	lines.push(`${prefix}${connector}${tree.node.id}${viaLabel}`)
	const childPrefix = prefix + (isLast ? '   ' : '│  ')
	tree.children.forEach((child, i) => {
		lines.push(renderTree(child, childPrefix, i === tree.children.length - 1))
	})
	return lines.join('\n')
}
