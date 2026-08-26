import { describe, it, expect } from 'bun:test'
import { buildPlanPayload } from '../cli/plan-cmd'

// Fixtures (`.specs/2026-05-13-*.md`) were removed during the polyglot
// repurpose. Re-fixture against a polyglot spec before un-skipping.
describe('buildPlanPayload (needs polyglot fixture)', () => {
	it('returns Option-A shape for a real spec', async () => {
		const payload = await buildPlanPayload('.specs/2026-05-13-agentic-coding-system-design.md')
		expect(payload).toHaveProperty('graphStats')
		expect(payload).toHaveProperty('registries')
		expect(payload).toHaveProperty('existingArtifacts')
		expect(payload).toHaveProperty('contextHints')
		expect(payload).toHaveProperty('inconsistencies')
		expect(payload.graphStats.nodeCount).toBeGreaterThan(0)
		expect(payload.graphStats.contexts.length).toBeGreaterThan(0)
		expect(Object.keys(payload.registries).length).toBeGreaterThan(0)
		expect(Array.isArray(payload.existingArtifacts)).toBe(true)
		expect(Array.isArray(payload.inconsistencies)).toBe(true)
	})

	it('groups contextHints by context with kind counts', async () => {
		const payload = await buildPlanPayload('.specs/2026-05-13-agentic-coding-system-design.md')
		const contexts = Object.keys(payload.contextHints)
		expect(contexts.length).toBeGreaterThan(0)
		for (const ctx of contexts) {
			const hist = payload.contextHints[ctx]
			expect(typeof hist).toBe('object')
			for (const k of Object.keys(hist!)) expect(typeof hist![k]).toBe('number')
		}
	})
})
