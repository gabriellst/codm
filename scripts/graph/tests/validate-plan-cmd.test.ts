import { describe, it, expect } from 'bun:test'
import { validatePlan } from '../cli/validate-plan-cmd'

describe('validatePlan', () => {
	// RE-FIXTURED 2026-08-14: pointed at `.plans/2026-05-13-agentic-coding-system-bootstrap.md`, which
	// never existed in this repo. A clean plan owned by the suite is a better subject anyway — the
	// assertion is "a well-formed plan raises nothing", and a living plan document drifts.
	it('raises nothing on a well-formed plan (PR-18..21, PR-26..28)', async () => {
		const r = await validatePlan('scripts/graph/tests/__fixtures__/plan-sample.md')
		expect(r.findings).toEqual([])
		expect(r.exitCode).toBe(0)
	})

	// The degraded path, which had no test at all — and could not have one, because the graph load
	// was a bare `catch {}` with no seam. A validator that answers OK to a question it never asked is
	// this repo's oldest failure shape; here it is exercised on purpose.
	it('REPORTS the graph-dependent rules as not evaluated when the graph is missing', async () => {
		const thrower = () => {
			throw new Error('graph.json not found. Run `bun cli graph build` first.')
		}
		const r = await validatePlan('scripts/graph/tests/__fixtures__/plan-sample.md', thrower)
		expect(r.skipped.length, 'a missing graph must be SAID, never swallowed').toBe(1)
		expect(r.skipped[0]).toContain('PR-18')
		expect(r.skipped[0]).toContain('PR-19')
		expect(r.exitCode, 'not-evaluated is not success — it is the absence of an answer').not.toBe(0)
	})

	it('reports nothing skipped when the graph is present', async () => {
		const r = await validatePlan('scripts/graph/tests/__fixtures__/plan-sample.md')
		expect(r.skipped).toEqual([])
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

	it('PR-27: exempts a net-new artifact in a lang with no `bun cli` generator (Go), but still flags one in a lang that has a generator (TS) with no scaffold step', async () => {
		const r = await validatePlan('scripts/graph/tests/__fixtures__/plan-generator-capability.md')
		const pr27 = r.findings.filter(f => f.rule === 'PR-27')
		// T1 hand-authors a new Go service with no `bun cli service` step — GENERATOR_SUPPORT.go is
		// false, so PR-27 must consult that declared capability and exempt it (T0 fix).
		expect(pr27.some(f => f.taskId === 'T1')).toBe(false)
		// T2 hand-authors a new TS entity with no `bun cli entity` step — GENERATOR_SUPPORT.typescript
		// is true, so PR-27 must still fire: the falsifier proving the fix didn't neuter the rule.
		expect(pr27.some(f => f.taskId === 'T2')).toBe(true)
	})
})
