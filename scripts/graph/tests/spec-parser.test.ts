import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { parseSpec } from '../cli/spec-parser'

// RE-FIXTURED 2026-08-14. This read `.specs/2026-05-13-agentic-coding-system-design.md`, a spec that
// NEVER existed in this repo (`git log --all --diff-filter=A` returns nothing) — it arrived with
// `scripts/graph/` from the source repo. Nothing ever ran this suite, so the dead pointer sat from
// 2026-07-21 until `test-liveness` found it. The fixture now lives under `__fixtures__/`, the same
// pattern the sibling tests already use: a parser test asserts on PARSING, not on the contents of a
// document that happens to be lying around and may be edited by anyone for unrelated reasons.
describe('parseSpec', () => {
	it('parses a spec file into typed sections', () => {
		const raw = readFileSync('scripts/graph/tests/__fixtures__/spec-sample.md', 'utf-8')
		const ast = parseSpec(raw)
		expect(ast.status).toBe('Approved')
		expect(ast.boundedContext).toContain('tooling')
		// Exact, not `>=`: the fixture is owned by this test, so a drift is a defect, not growth.
		expect(ast.decisions.length).toBe(5)
		expect(ast.componentsAffected.length).toBe(4)
		expect(ast.acceptanceCriteria.length).toBe(6)
	})

	it('returns empty arrays for missing sections', () => {
		const ast = parseSpec('# Title\n\n**Status:** Draft\n')
		expect(ast.decisions).toEqual([])
		expect(ast.componentsAffected).toEqual([])
	})
})
