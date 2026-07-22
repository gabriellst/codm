import { describe, it, expect } from 'bun:test'
import { validatePlan } from '../cli/validate-plan-cmd'

describe('validatePlan', () => {
	it('passes the bootstrap plan against itself (PR-18..21) (needs polyglot fixture)', async () => {
		const r = await validatePlan('.plans/2026-05-13-agentic-coding-system-bootstrap.md')
		expect(r.exitCode).toBe(0)
		expect(r.findings).toEqual([])
	})

	it('flags a bogus path under filesWrites as PR-18', async () => {
		const fixturePath = 'scripts/graph/tests/__fixtures__/plan-with-bogus-path.md'
		const r = await validatePlan(fixturePath)
		expect(r.exitCode).not.toBe(0)
		expect(r.findings.some(f => f.rule === 'PR-18')).toBe(true)
	})

	it('PR-28: flags a dependent Task with no handoff, exempts the compliant one and Phase-0', async () => {
		const r = await validatePlan('scripts/graph/tests/__fixtures__/plan-missing-handoff.md')
		const pr28 = r.findings.filter(f => f.rule === 'PR-28')
		// T2 depends on T1 but declares neither Consumes nor Gate → two PR-28 findings.
		expect(pr28.some(f => f.taskId === 'T2')).toBe(true)
		expect(pr28.filter(f => f.taskId === 'T2').length).toBe(2)
		// T3 depends on T1 but carries a full handoff → not flagged.
		expect(pr28.some(f => f.taskId === 'T3')).toBe(false)
		// T1 is a Phase-0 contract Task (no deps) → exempt even without a handoff.
		expect(pr28.some(f => f.taskId === 'T1')).toBe(false)
	})

	it('PR-19: flags a pure-modify chain with no graph edge but skips a pair that writes a net-new file', async () => {
		const r = await validatePlan('scripts/graph/tests/__fixtures__/plan-net-new-dependency.md')
		const pr19 = r.findings.filter(f => f.rule === 'PR-19')
		// T2 and T3 both depend on T1 and both write an existing tracked entity with no upstream
		// edge back to T1's entity — structurally identical. The ONLY difference is T3 also writes
		// a net-new file (no graph node yet). PR-19 must judge the pure-modify chain (T2 → flagged)
		// but skip the pair that flows through a net-new artifact (T3 → not flagged): the fix for
		// PR-19's documented false positive.
		expect(pr19.some(f => f.taskId === 'T2')).toBe(true)
		expect(pr19.some(f => f.taskId === 'T3')).toBe(false)
	})
})
