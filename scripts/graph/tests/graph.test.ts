import { describe, expect, it } from 'bun:test'
import { addEdge, addNode, edgeId, newGraph, nodeId, serializeGraph, sdkId } from '../core/graph'
import { buildAdjacency, downstream, orphans, shortestPath, upstream } from '../core/query'

describe('graph core', () => {
	it('builds stable node IDs', () => {
		const id = nodeId({ service: 'api', kind: 'entity', context: 'appointment', name: 'Appointment' })
		expect(id).toBe('api:appointment:entity:Appointment')
	})

	it('builds SDK IDs without context', () => {
		const id = sdkId({ flavor: 'app', kind: 'sdk-hook', name: 'useListPatients' })
		expect(id).toBe('sdk:app:sdk-hook:useListPatients')
	})

	it('addNode merges metadata when called twice with same id', () => {
		const g = newGraph()
		addNode(g, { id: 'x', kind: 'entity', name: 'X', service: 'api', metadata: { a: 1 } })
		addNode(g, { id: 'x', kind: 'entity', name: 'X', service: 'api', metadata: { b: 2 } })
		expect(g.nodes.size).toBe(1)
		expect(g.nodes.get('x')!.metadata).toMatchObject({ a: 1, b: 2 })
	})

	it('serialization is deterministic — sorts nodes and edges by id', () => {
		const g = newGraph()
		addNode(g, { id: 'b', kind: 'entity', name: 'B', service: 'api' })
		addNode(g, { id: 'a', kind: 'entity', name: 'A', service: 'api' })
		const ser = serializeGraph(g)
		expect(ser.nodes.map(n => n.id)).toEqual(['a', 'b'])
	})
})

describe('graph queries', () => {
	function makeFixture() {
		const g = newGraph()
		addNode(g, { id: 'route', kind: 'frontend-route', name: 'route', service: 'app' })
		addNode(g, { id: 'section', kind: 'frontend-section', name: 'section', service: 'app' })
		addNode(g, { id: 'hook', kind: 'sdk-hook', name: 'hook', service: 'sdk' })
		addNode(g, { id: 'op', kind: 'sdk-operation', name: 'op', service: 'sdk' })
		addNode(g, { id: 'ctrl', kind: 'controller', name: 'ctrl', service: 'api' })
		addNode(g, { id: 'uc', kind: 'usecase', name: 'uc', service: 'api' })
		addNode(g, { id: 'tbl', kind: 'db-table', name: 'tbl', service: 'db' })

		addEdge(g, { id: edgeId('route', 'renders', 'section'), from: 'route', to: 'section', kind: 'renders', audit: 'EXTRACTED' })
		addEdge(g, {
			id: edgeId('section', 'consumes-sdk-hook', 'hook'),
			from: 'section',
			to: 'hook',
			kind: 'consumes-sdk-hook',
			audit: 'EXTRACTED',
		})
		addEdge(g, { id: edgeId('op', 'generates-sdk-hook', 'hook'), from: 'op', to: 'hook', kind: 'generates-sdk-hook', audit: 'EXTRACTED' })
		addEdge(g, { id: edgeId('ctrl', 'generates-sdk', 'op'), from: 'ctrl', to: 'op', kind: 'generates-sdk', audit: 'EXTRACTED' })
		addEdge(g, { id: edgeId('ctrl', 'wraps-usecase', 'uc'), from: 'ctrl', to: 'uc', kind: 'wraps-usecase', audit: 'EXTRACTED' })
		addEdge(g, { id: edgeId('uc', 'reads-table', 'tbl'), from: 'uc', to: 'tbl', kind: 'reads-table', audit: 'EXTRACTED' })
		return g
	}

	it('downstream returns full impact tree', () => {
		const g = makeFixture()
		const adj = buildAdjacency(g)
		const result = downstream(g, adj, 'ctrl')
		expect(result).not.toBeNull()
		// ctrl → op → hook AND ctrl → uc → tbl
		const ids = collectIds(result!.tree)
		expect(ids).toContain('ctrl')
		expect(ids).toContain('op')
		expect(ids).toContain('uc')
		expect(ids).toContain('tbl')
	})

	it('upstream from a hook surfaces the operation and controller', () => {
		const g = makeFixture()
		const adj = buildAdjacency(g)
		const result = upstream(g, adj, 'hook')
		expect(result).not.toBeNull()
		const ids = collectIds(result!.tree)
		expect(ids).toContain('op')
		expect(ids).toContain('ctrl')
		expect(ids).toContain('section')
	})

	it('shortestPath finds undirected route → table', () => {
		const g = makeFixture()
		const adj = buildAdjacency(g)
		const path = shortestPath(g, adj, 'route', 'tbl')
		expect(path).not.toBeNull()
		const kinds = path!.map(s => s.edge.kind)
		expect(kinds).toContain('renders')
		expect(kinds).toContain('consumes-sdk-hook')
		expect(kinds).toContain('generates-sdk-hook')
		expect(kinds).toContain('generates-sdk')
		expect(kinds).toContain('wraps-usecase')
		expect(kinds).toContain('reads-table')
	})

	it('shortestPath in directed mode does NOT cross edge directions', () => {
		const g = makeFixture()
		const adj = buildAdjacency(g)
		// route → section → hook works (forward), but hook has no forward edge to op (only incoming)
		const path = shortestPath(g, adj, 'route', 'tbl', { directed: true })
		expect(path).toBeNull()
	})

	it('orphans returns nodes without edges', () => {
		const g = newGraph()
		addNode(g, { id: 'lonely', kind: 'entity', name: 'lonely', service: 'api' })
		addNode(g, { id: 'connected', kind: 'entity', name: 'connected', service: 'api' })
		addNode(g, { id: 'other', kind: 'entity', name: 'other', service: 'api' })
		addEdge(g, { id: 'e', from: 'connected', to: 'other', kind: 'orchestrates', audit: 'EXTRACTED' })
		const adj = buildAdjacency(g)
		const o = orphans(g, adj)
		expect(o.map(n => n.id)).toEqual(['lonely'])
	})
})

interface IdTree {
	node: { id: string }
	children: IdTree[]
}

function collectIds(tree: IdTree): string[] {
	const ids: string[] = []
	function walk(t: IdTree) {
		ids.push(t.node.id)
		for (const c of t.children) walk(c)
	}
	walk(tree)
	return ids
}
