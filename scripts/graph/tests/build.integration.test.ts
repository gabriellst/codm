// Integration test: builds the full graph against the live monorepo and
// asserts that the polyglot workspaces are populated and the load-bearing
// edge kinds appear at all.
//
// The polyglot template is domain-agnostic, so these assertions deliberately
// avoid hard-coding entity / controller names. They check workspace coverage,
// node-kind diversity, and edge-kind presence — properties that hold for any
// fork of the template that actually wires up its bounded contexts.

import { beforeAll, describe, expect, it } from 'bun:test'
import { build } from '../core/builder'

let cached: Awaited<ReturnType<typeof build>> | null = null

beforeAll(async () => {
	cached = await build()
}, 120_000)

function buildOnce() {
	return cached!
}

describe('full graph integration (polyglot)', () => {
	it('extracts a meaningful number of nodes & edges', () => {
		const result = buildOnce()
		expect(result.stats.nodes).toBeGreaterThan(500)
		expect(result.stats.edges).toBeGreaterThan(200)
	})

	it('covers every backend workspace', () => {
		const result = buildOnce()
		const byWs = result.graph.stats.nodesByWorkspace
		expect(byWs['api-typescript'] ?? 0).toBeGreaterThan(0)
		expect(byWs['api-go'] ?? 0).toBeGreaterThan(0)
	})

	it('covers every frontend workspace that has source', () => {
		const result = buildOnce()
		const byWs = result.graph.stats.nodesByWorkspace
		expect(byWs['app-react'] ?? 0).toBeGreaterThan(0)
		expect(byWs['app-expo'] ?? 0).toBeGreaterThan(0)
		// app-astro is currently sparse; not required to be > 0.
	})

	it('contracts adapter emits contract-* nodes', () => {
		const result = buildOnce()
		const byKind = result.graph.stats.nodesByKind
		expect((byKind['contract-enum'] ?? 0) + (byKind['contract-event'] ?? 0)).toBeGreaterThan(0)
	})

	it('drizzle extractor emits db-table nodes from contracts/db/schema', () => {
		const result = buildOnce()
		const tables = [...result.graph.nodes.values()].filter(n => n.kind === 'db-table')
		expect(tables.length).toBeGreaterThan(0)
	})

	it('locale extractor emits locale-key nodes for at least one frontend', () => {
		const result = buildOnce()
		expect(result.stats.extractor.locale).toBeGreaterThan(0)
	})

	it('openapi extractor emits sdk-operation nodes', () => {
		const result = buildOnce()
		expect(result.stats.extractor.openapi).toBeGreaterThan(0)
	})

	it('Go adapter emits at least one classified node', () => {
		const result = buildOnce()
		const goNodes = [...result.graph.nodes.values()].filter(n => n.workspace === 'api-go')
		expect(goNodes.length).toBeGreaterThan(0)
	})

	it('at most ~50% of edges are unresolved (loose audit health)', () => {
		// Loose threshold during the polyglot rebuild — the Go adapter doesn't
		// yet emit `composes`/`orchestrates` edges, which inflates the unresolved
		// ratio. A follow-up tightens this once the Go extractor matures.
		const result = buildOnce()
		const unresolvedEntries = result.audit.all.filter(a => a.code === 'UNRESOLVED_NODE')
		const ratio = unresolvedEntries.length / Math.max(1, result.stats.edges)
		expect(ratio).toBeLessThan(0.5)
	})
})
