import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { parsePlan } from '../cli/plan-parser'

// RE-FIXTURED 2026-08-14. `PLAN_PATH` was `.plans/2026-05-13-agentic-coding-system-bootstrap.md`, a
// plan that NEVER existed in this repo — it came with `scripts/graph/` from the source repo. Worse
// than the dead pointer was the SKIP built around it: `describeIf = hasFixture ? describe :
// describe.skip` turned a missing fixture into a silent pass, so the whole suite reported green-ish
// while asserting nothing. There is no `existsSync` guard now, on purpose: if the fixture goes
// missing the read THROWS, which is the honest failure. NO SKIP, EVER.
const PLAN_PATH = 'scripts/graph/tests/__fixtures__/plan-sample.md'

describe('parsePlan', () => {
	const raw = readFileSync(PLAN_PATH, 'utf-8')
	const ast = parsePlan(raw)

	it('parses this bootstrap plan into typed Tasks', () => {
		expect(ast.tasks.length).toBeGreaterThanOrEqual(4)
		const t1 = ast.tasks.find(t => t.id === 'T1')!
		expect(t1.agent).toBe('backend-developer')
		expect(t1.reviewer).toBe('code-reviewer')
		expect(t1.filesWrites).toContain('scripts/graph/cli/spec-parser.ts')
		expect(t1.dependsOn).toEqual([])
		const t2 = ast.tasks.find(t => t.id === 'T2')!
		expect(t2.dependsOn).toContain('T1')
	})

	it('detects status=done from "(DONE)" title suffix and explicit Status field', () => {
		const t0 = ast.tasks.find(t => t.id === 'T0')!
		expect(t0.status).toBe('done')
		const t5 = ast.tasks.find(t => t.id === 'T5')!
		expect(t5.status).toBe('done')
		const t1 = ast.tasks.find(t => t.id === 'T1')!
		expect(t1.status).toBe('pending')
	})

	it('strips parenthetical annotations from agent field', () => {
		const t5 = ast.tasks.find(t => t.id === 'T5')!
		expect(t5.agent).toBe('backend-developer')
		expect(t5.agent).not.toContain('(')
	})

	it('exposes step.body containing the raw markdown of the step section', () => {
		const t1 = ast.tasks.find(t => t.id === 'T1')!
		const firstStep = t1.steps[0]!
		expect(firstStep.id).toBe('T1.1')
		expect(firstStep.title.length).toBeGreaterThan(0)
		expect(firstStep.body.length).toBeGreaterThan(100)
		expect(firstStep.body).toContain('Create `scripts/graph/tests/spec-parser.test.ts`')
		expect(firstStep.checks.length).toBeGreaterThan(0)
	})

	it('produces one PlanStep per ### Step heading (not per bullet)', () => {
		const t1 = ast.tasks.find(t => t.id === 'T1')!
		const stepIds = t1.steps.map(s => s.id)
		expect(new Set(stepIds).size).toBe(stepIds.length)
	})
})
