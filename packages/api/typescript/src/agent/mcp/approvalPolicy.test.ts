import { describe, expect, it } from 'bun:test'
import { McpApprovalPolicy } from '@codm/contracts-typescript/wire/enums'
import { resolveMcpCallDisposition } from './approvalPolicy'

/**
 * T10 — proves the ONE function that decides between gating and executing an external tool call has
 * NO state without an exit. Every path this file drives ends in `execute` or `gate`, and every `gate`
 * it produces carries a live approval path (`ownerWantsToBeAsked === true`) — the invariant the
 * docblock in `approvalPolicy.ts` argues in prose, made a property here.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * NO production edits happen from this file. If an assertion below disagrees with the implementation,
 * that is a finding to report, not a defect to quietly fix here (see the Task's scope fence).
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
describe('resolveMcpCallDisposition', () => {
	describe('the four combinations of (server policy × ownerWantsToBeAsked), with no tool override', () => {
		it('server AUTO, owner wants to be asked → execute (AUTO never asks, regardless of the owner toggle)', () => {
			expect(resolveMcpCallDisposition({ serverPolicy: McpApprovalPolicy.AUTO, ownerWantsToBeAsked: true })).toBe('execute')
		})

		it('server AUTO, owner does NOT want to be asked → execute', () => {
			expect(resolveMcpCallDisposition({ serverPolicy: McpApprovalPolicy.AUTO, ownerWantsToBeAsked: false })).toBe('execute')
		})

		it('server ASK, owner wants to be asked → gate (the only combination that gates)', () => {
			expect(resolveMcpCallDisposition({ serverPolicy: McpApprovalPolicy.ASK, ownerWantsToBeAsked: true })).toBe('gate')
		})

		it('server ASK, owner does NOT want to be asked → execute — the pre-approved / dangerous-mode case. Gating here would block the call forever: the owner forbade the stop that would have released it.', () => {
			expect(resolveMcpCallDisposition({ serverPolicy: McpApprovalPolicy.ASK, ownerWantsToBeAsked: false })).toBe('execute')
		})
	})

	describe('a per-tool override wins over the server policy, in BOTH directions', () => {
		it('the browser-use scenario — server AUTO overall, one tool held at ASK — the tool override gates', () => {
			expect(
				resolveMcpCallDisposition({
					serverPolicy: McpApprovalPolicy.AUTO,
					toolPolicy: McpApprovalPolicy.ASK,
					ownerWantsToBeAsked: true,
				}),
			).toBe('gate')
		})

		it('the inverse — server ASK overall, one harmless read released to AUTO — the tool override executes', () => {
			expect(
				resolveMcpCallDisposition({
					serverPolicy: McpApprovalPolicy.ASK,
					toolPolicy: McpApprovalPolicy.AUTO,
					ownerWantsToBeAsked: true,
				}),
			).toBe('execute')
		})
	})

	describe('the global pre-approval beats even a per-tool override', () => {
		it('server AUTO, tool override ASK, owner does NOT want to be asked → execute — the override alone would gate, but the owner globally pre-approved', () => {
			expect(
				resolveMcpCallDisposition({
					serverPolicy: McpApprovalPolicy.AUTO,
					toolPolicy: McpApprovalPolicy.ASK,
					ownerWantsToBeAsked: false,
				}),
			).toBe('execute')
		})

		it('server ASK, tool override ASK (an explicit ASK re-stated at the tool level), owner does NOT want to be asked → still execute', () => {
			expect(
				resolveMcpCallDisposition({
					serverPolicy: McpApprovalPolicy.ASK,
					toolPolicy: McpApprovalPolicy.ASK,
					ownerWantsToBeAsked: false,
				}),
			).toBe('execute')
		})
	})

	/**
	 * THE PROPERTY THAT MATTERS. Iterates every combination of (server policy × tool override,
	 * including ABSENT × ownerWantsToBeAsked) — 2 × 3 × 2 = 12 cases — and checks ONE invariant on
	 * every one of them: a `gate` result is legitimate only when a path to approval exists. If the
	 * function ever gated while `ownerWantsToBeAsked` were `false`, that call would be blocked with no
	 * way out — the owner forbade the very stop that could release it. This is the state-without-an-exit
	 * this Task exists to rule out, checked exhaustively rather than on the handful of cases above.
	 */
	describe('exhaustive property — gate is only legitimate when a path to approval exists', () => {
		const POLICIES = [McpApprovalPolicy.AUTO, McpApprovalPolicy.ASK] as const
		const TOOL_OVERRIDES = [McpApprovalPolicy.AUTO, McpApprovalPolicy.ASK, undefined] as const
		const OWNER_WANTS_TO_BE_ASKED = [true, false] as const

		for (const serverPolicy of POLICIES) {
			for (const toolPolicy of TOOL_OVERRIDES) {
				for (const ownerWantsToBeAsked of OWNER_WANTS_TO_BE_ASKED) {
					const label = `server=${serverPolicy} tool=${toolPolicy ?? '(absent)'} ownerWantsToBeAsked=${ownerWantsToBeAsked}`

					it(`${label} → disposition is 'gate' ⇒ ownerWantsToBeAsked was true`, () => {
						const disposition = resolveMcpCallDisposition({ serverPolicy, toolPolicy, ownerWantsToBeAsked })

						// Every disposition is one of the two members — a third silent state would fail this.
						expect(['execute', 'gate']).toContain(disposition)

						if (disposition === 'gate') {
							expect(ownerWantsToBeAsked).toBe(true)
						}
					})
				}
			}
		}
	})
})
