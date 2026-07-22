import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { parseSpec } from '../cli/spec-parser'

// The old bootstrap spec fixture was removed during the template repurpose.
// Re-fixture against a template spec (e.g. .specs/graph-template.md)
// in a follow-up before un-skipping.
describe('parseSpec (needs polyglot fixture)', () => {
	it('parses a real spec file into typed sections', () => {
		const raw = readFileSync('.specs/2026-05-13-agentic-coding-system-design.md', 'utf-8')
		const ast = parseSpec(raw)
		expect(ast.status).toBe('Approved')
		expect(ast.boundedContext).toContain('tooling')
		expect(ast.decisions.length).toBeGreaterThanOrEqual(26)
		expect(ast.componentsAffected.length).toBeGreaterThan(0)
		expect(ast.acceptanceCriteria.length).toBeGreaterThanOrEqual(17)
	})

	it('returns empty arrays for missing sections', () => {
		const ast = parseSpec('# Title\n\n**Status:** Draft\n')
		expect(ast.decisions).toEqual([])
		expect(ast.componentsAffected).toEqual([])
	})
})
