import { describe, it, expect } from 'bun:test'
import { parsePlan, parseEditBlocks, applyEdits, extractCliInvocations, reconstructTaskFiles } from './review-plan'

// The fixture is an embedded plan. Build it via array-join, and produce `##` and
// the ``` fence through `H`/`F` constants — so the fixture's own headings/fences
// stay INDENTED in this test file's source and never collide with the outer
// markdown (parsers match line-start `## Task` regardless of code fences).
const H = '##'
const F = '`'.repeat(3)
const PLAN = [
	'# Demo — Implementation Plan',
	'',
	'**Spec:** .specs/x.md',
	'',
	`${H} Task T1: First behavior`,
	'',
	'**Files to write:**',
	'- Create: `scripts/demo/a.ts`',
	'',
	`${H}# Step T1.1 — impl`,
	`${F}typescript`,
	'export const a = 1',
	F,
	'',
	`${H} Task T2: Second behavior`,
	'',
	'**Files to write:**',
	'- Create: `scripts/demo/b.ts`',
	'',
	`${H}# Step T2.1 — impl`,
	`${F}typescript`,
	'export const b = 2',
	F,
	'',
	`${H} Final Validation`,
	'- [ ] tsc',
].join('\n')

describe('parsePlan (canonical T-prefixed grammar)', () => {
	it('extracts both T-prefixed tasks (regression: was 0 with the old \\d+ regex)', async () => {
		const files = await parsePlan(PLAN)
		expect(files.map(f => f.taskId).sort()).toEqual(['T1', 'T2'])
	})

	it('attributes each code block to its Create path', async () => {
		const files = await parsePlan(PLAN)
		const a = files.find(f => f.destPath === 'scripts/demo/a.ts')
		expect(a?.code).toContain('export const a = 1')
	})

	it('does not bleed Final Validation into the last task', async () => {
		const files = await parsePlan(PLAN)
		expect(files.every(f => !f.code.includes('tsc'))).toBe(true)
	})
})

describe('edit blocks', () => {
	it('parses a SEARCH/REPLACE edit fence', () => {
		const md = [`${F}edit`, '<<<<<<< SEARCH', 'old line', '=======', 'new line', '>>>>>>> REPLACE', F].join('\n')
		expect(parseEditBlocks(md)).toEqual([{ path: undefined, search: 'old line', replace: 'new line' }])
	})

	it('applies an edit by exact single match', () => {
		expect(applyEdits('a\nold line\nb', [{ search: 'old line', replace: 'new line' }])).toBe('a\nnew line\nb')
	})

	it('throws when the SEARCH text is absent', () => {
		expect(() => applyEdits('a\nb', [{ search: 'missing', replace: 'x' }])).toThrow(/not found/)
	})

	it('throws when the SEARCH text matches more than once', () => {
		expect(() => applyEdits('x\nx', [{ search: 'x', replace: 'y' }])).toThrow(/more than once/)
	})
})

describe('extractCliInvocations', () => {
	it('parses a bun cli line into verb + positional + flags', () => {
		const md = [`${F}bash`, 'bun cli entity sales Order --aggregate', F].join('\n')
		expect(extractCliInvocations(md)).toEqual([{ verb: 'entity', positional: ['sales', 'Order'], flags: { aggregate: 'true' } }])
	})
})

describe('reconstructTaskFiles (scaffold-then-mutate)', () => {
	// Same H/F technique as the top-of-file fixture: keep `##`/``` out of column 0
	// and out of literal triple-backticks so the embedded task can't corrupt this plan.
	const TASK = [
		`${H} Task T1: Order ships`,
		'',
		'**Files to write:**',
		'- Create: `packages/api/typescript/src/sales/entities/Order.ts`',
		'',
		`${H}# Step T1.1 — Scaffold`,
		`${F}bash`,
		'bun cli entity sales Order --aggregate',
		F,
		'',
		`${H}# Step T1.2 — Mutate`,
		`${F}edit`,
		'<<<<<<< SEARCH',
		'\t// Mutation methods:',
		'=======',
		"\tship(): void { this.status = 'SHIPPED' }",
		'>>>>>>> REPLACE',
		F,
	].join('\n')

	it('renders the registry skeleton and applies the delta', async () => {
		const files = await reconstructTaskFiles(TASK)
		expect(files).toHaveLength(1)
		expect(files[0]!.filePath).toContain('sales/entities/Order.ts')
		expect(files[0]!.content).toContain('extends AggregateRoot') // Phase-A skeleton preserved
		expect(files[0]!.content).toContain("ship(): void { this.status = 'SHIPPED' }") // delta applied
		expect(files[0]!.content).not.toContain('// Mutation methods:') // SEARCH replaced
	})
})

describe('reconstructTaskFiles (go)', () => {
	const GO = [
		`${H} Task T1: Go coupon`,
		'',
		'**Files to write:**',
		'- Create: `packages/api/go/internal/sales/entities/coupon.go`',
		'',
		`${H}# Step T1.1 — Scaffold`,
		`${F}bash`,
		'bun cli entity sales Coupon --lang=go',
		F,
	].join('\n')

	it('reconstructs a Go entity from its go registry snippet (no edits)', async () => {
		const files = await reconstructTaskFiles(GO)
		expect(files).toHaveLength(1)
		expect(files[0]!.filePath).toContain('go/internal/sales/entities')
		expect(files[0]!.content).toContain('package') // real Go source, rendered from the go snippet
	})
})

describe('reconstructTaskFiles (frontend)', () => {
	const FRONT = [
		`${H} Task T1: Coupons screen`,
		'',
		'**Files to write:**',
		'- Create: `packages/app/react/src/routes/(app)/coupons/-components/CouponListSection/index.tsx`',
		'',
		`${H}# Step T1.1 — Scaffold`,
		`${F}bash`,
		'bun cli component (app)/coupons CouponListSection --recipe section --sdk Coupon --state query --skeleton --i18n coupons',
		F,
		'',
		`${H}# Step T1.2 — Mutate`,
		`${F}edit`,
		'<<<<<<< SEARCH',
		'{/* Implement section */}',
		'=======',
		'<CouponTable coupons={data} />',
		'>>>>>>> REPLACE',
		F,
	].join('\n')

	it('renders the react component from its registry fragments and applies the delta', async () => {
		const files = await reconstructTaskFiles(FRONT)
		expect(files).toHaveLength(1)
		expect(files[0]!.filePath).toContain('CouponListSection/index.tsx')
		expect(files[0]!.content).toContain('useListCoupons') // fragment-sourced query hook
		expect(files[0]!.content).toContain('<CouponTable coupons={data} />') // delta applied
		expect(files[0]!.content).not.toContain('{/* Implement section */}') // SEARCH replaced
	})
})
