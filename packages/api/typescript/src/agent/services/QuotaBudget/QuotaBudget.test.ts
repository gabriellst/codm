import { describe, expect, it } from 'bun:test'
import { ProviderLimitWindow, UsageRole } from '@codm/contracts-typescript/wire/enums'
import { ProviderLimitStatus } from '../../enums/ProviderLimitStatus'
import { QuotaBudget, QUOTA_RESERVE_MIN_SHARE, QUOTA_RESERVE_START_SHARE, WINDOW_LENGTH_MS } from './QuotaBudget'
import type { QuotaLedger, QuotaUsageFact } from './QuotaLedger'

/**
 * THE QUOTA BUDGET, PURE (fase 4, S2): admission in both windows, the orchestrator's floor, the learned ceiling (cut
 * on a refusal with the turns in flight projected, cut on a warning, probed upward, back to the seed on a swapped
 * account), `UNKNOWN` cutting only five hours, and the mean that keeps the heavy tail.
 */
const H = 60 * 60 * 1000
const DAY = 24 * H
const NOW = 100 * DAY
const SEED = { [ProviderLimitWindow.FIVE_HOUR]: 1_000, [ProviderLimitWindow.WEEKLY]: 10_000 }
const budget = new QuotaBudget({ seedCeiling: SEED })

const turn = (at: number, cost: number, role = UsageRole.ISSUE, entityId = `e-${at}`): QuotaUsageFact => ({
	at,
	entityId,
	role,
	cost,
	windows: [],
})
const ledger = (parts: Partial<QuotaLedger>): QuotaLedger => ({ usage: [], limits: [], holds: [], issueRunStarts: [], ...parts })

describe('QuotaBudget — admission', () => {
	it('an empty ledger admits: nothing spent, nothing expected', () => {
		const decision = budget.admit({ inFlight: 0, now: NOW, ledger: ledger({}) })
		expect(decision.admitted).toBe(true)
		expect(decision.expectedTurnCost).toBe(0)
	})

	it('holds when one more issue turn would cross the five-hour ceiling minus the floor', () => {
		// floor = 18.6% of 1000 (no week of facts yet); room for issues = 814. Spent 500, expected 200 → 700 fits.
		const fits = ledger({ usage: [turn(NOW - H, 200), turn(NOW - 2 * H, 300), turn(NOW - 6 * H, 100)] })
		expect(budget.admit({ inFlight: 0, now: NOW, ledger: fits }).admitted).toBe(true)
		// one turn in flight projects another 200 (the mean) → 900, over the room
		const decision = budget.admit({ inFlight: 1, now: NOW, ledger: fits })
		expect(decision.admitted).toBe(false)
		expect(decision.heldBy).toBe(ProviderLimitWindow.FIVE_HOUR)
	})

	it('holds on the WEEK when the five hours are empty but the week is spent', () => {
		const week = ledger({ usage: Array.from({ length: 18 }, (_, i) => turn(NOW - (6 + i * 8) * H, 450)) })
		const decision = budget.admit({ inFlight: 0, now: NOW, ledger: week })
		expect(decision.accounts[ProviderLimitWindow.FIVE_HOUR].spent).toBe(0)
		expect(decision.heldBy).toBe(ProviderLimitWindow.WEEKLY)
	})

	it('a window boundary the CLI reported anchors the window instead of sliding it', () => {
		const resetsAt = NOW + H
		const anchored = ledger({
			usage: [
				{ ...turn(NOW - 4.5 * H, 500), windows: [] },
				{ ...turn(NOW - 3 * H, 10), windows: [{ window: ProviderLimitWindow.FIVE_HOUR, resetsAt }] },
			],
		})
		// the window runs from resetsAt − 5h = NOW − 4h: the 500 spent at NOW − 4.5h is outside it
		const account = budget.accounts(NOW, anchored)[ProviderLimitWindow.FIVE_HOUR]
		expect(account.spent).toBe(10)
		expect(account.resetsAt).toBe(resetsAt)
	})

	it('the expected cost is the MEAN of the recent issue turns — the tail counts — and ignores turns that spent nothing', () => {
		const tail = ledger({ usage: [turn(NOW - 3 * H, 10), turn(NOW - 2 * H, 10), turn(NOW - H, 100), turn(NOW - H / 2, 0)] })
		expect(budget.expectedTurnCost(NOW, tail)).toBe(40)
	})
})

describe('QuotaBudget — the orchestrator floor (max(5%, measured))', () => {
	const weekOfFacts = (orchestratorShare: number): QuotaLedger =>
		ledger({
			firstRoleFactAt: NOW - 8 * DAY,
			usage: [turn(NOW - 3 * DAY, 1_000 * (1 - orchestratorShare)), turn(NOW - 2 * DAY, 1_000 * orchestratorShare, UsageRole.ORCHESTRATOR)],
		})

	it('before a week of role-stamped facts, the starting figure of the measurement', () => {
		expect(budget.reserveShare(NOW, ledger({ firstRoleFactAt: NOW - DAY }))).toBe(QUOTA_RESERVE_START_SHARE)
	})

	it('measured ABOVE 5%: the measured share', () => {
		expect(budget.reserveShare(NOW, weekOfFacts(0.3))).toBeCloseTo(0.3)
	})

	it('measured BELOW 5%: the owner’s 5%', () => {
		expect(budget.reserveShare(NOW, weekOfFacts(0.02))).toBe(QUOTA_RESERVE_MIN_SHARE)
	})

	it('the triage counts on the orchestrator’s side', () => {
		const withTriage = ledger({
			firstRoleFactAt: NOW - 8 * DAY,
			usage: [turn(NOW - DAY, 800), turn(NOW - DAY, 100, UsageRole.ORCHESTRATOR), turn(NOW - DAY, 100, UsageRole.TRIAGE)],
		})
		expect(budget.reserveShare(NOW, withTriage)).toBeCloseTo(0.2)
	})

	// Fase 5 (S4): the supervisor's small-model runs serve the orchestration too — inside the reserve, never the tasks'.
	it('the supervisor counts on the orchestrator’s side', () => {
		const withSupervisor = ledger({
			firstRoleFactAt: NOW - 8 * DAY,
			usage: [turn(NOW - DAY, 800), turn(NOW - DAY, 100, UsageRole.ORCHESTRATOR), turn(NOW - DAY, 100, UsageRole.SUPERVISOR)],
		})
		expect(budget.reserveShare(NOW, withSupervisor)).toBeCloseTo(0.2)
	})

	it('the floor is the orchestrator’s spend when it already spent more than its share — never counted twice', () => {
		const spentMore = ledger({ usage: [turn(NOW - H, 400, UsageRole.ORCHESTRATOR), turn(NOW - H, 200)] })
		const account = budget.admit({ inFlight: 0, now: NOW, ledger: spentMore }).accounts[ProviderLimitWindow.FIVE_HOUR]
		expect(account.reserveFloor).toBe(400)
		// room for issues: 1000 − 400 = 600; spent 200, expected 200 → fits
		expect(budget.admit({ inFlight: 0, now: NOW, ledger: spentMore }).admitted).toBe(true)
	})
})

describe('QuotaBudget — the learned ceiling', () => {
	const refusedAt = NOW - 2 * H

	it('a refusal cuts the ceiling to what was spent plus the issue turns in flight', () => {
		const refused = ledger({
			usage: [turn(refusedAt - H, 300), turn(refusedAt - H / 2, 100, UsageRole.ISSUE, 'reported')],
			limits: [{ at: refusedAt, window: ProviderLimitWindow.FIVE_HOUR, status: ProviderLimitStatus.REJECTED }],
			// two turns started and not reported by the refusal; `reported` started and reported — not in flight
			issueRunStarts: [
				{ at: refusedAt - 10 * 60_000, entityId: 'a' },
				{ at: refusedAt - 5 * 60_000, entityId: 'b' },
				{ at: refusedAt - H, entityId: 'reported' },
			],
		})
		// spent 400; expected = mean(300, 100) = 200; two in flight → 400 + 400
		expect(budget.ceiling(ProviderLimitWindow.FIVE_HOUR, NOW, refused)).toBe(800)
		expect(budget.ceiling(ProviderLimitWindow.WEEKLY, NOW, refused)).toBe(SEED[ProviderLimitWindow.WEEKLY])
	})

	it('a warning cuts a declared step above the spend', () => {
		const warned = ledger({
			usage: [turn(refusedAt - H, 500)],
			limits: [{ at: refusedAt, window: ProviderLimitWindow.FIVE_HOUR, status: ProviderLimitStatus.WARNING }],
		})
		expect(budget.ceiling(ProviderLimitWindow.FIVE_HOUR, NOW, warned)).toBeCloseTo(550)
	})

	it('UNKNOWN cuts only the five-hour window', () => {
		const unknown = ledger({
			usage: [turn(refusedAt - H, 500)],
			limits: [{ at: refusedAt, window: ProviderLimitWindow.UNKNOWN, status: ProviderLimitStatus.REJECTED }],
		})
		expect(budget.ceiling(ProviderLimitWindow.FIVE_HOUR, NOW, unknown)).toBe(500)
		expect(budget.ceiling(ProviderLimitWindow.WEEKLY, NOW, unknown)).toBe(SEED[ProviderLimitWindow.WEEKLY])
	})

	it('probes upward after two whole windows without a refusal and with the lane held — would-have-held counts', () => {
		const five = WINDOW_LENGTH_MS[ProviderLimitWindow.FIVE_HOUR]
		const start = NOW - 3 * five
		const held = (enforced: boolean) =>
			ledger({
				// held across the first window into the second, released in it
				holds: [
					{ at: start + H, window: ProviderLimitWindow.FIVE_HOUR, holding: true, enforced },
					{ at: start + five + H, window: ProviderLimitWindow.FIVE_HOUR, holding: false, enforced },
				],
			})
		expect(budget.ceiling(ProviderLimitWindow.FIVE_HOUR, NOW, held(true))).toBeCloseTo(1_100)
		expect(budget.ceiling(ProviderLimitWindow.FIVE_HOUR, NOW, held(false))).toBeCloseTo(1_100)
		// one held window then an idle one: the streak breaks, no proof of demand
		const broken = ledger({
			holds: [
				{ at: start + H, window: ProviderLimitWindow.FIVE_HOUR, holding: true, enforced: true },
				{ at: start + 2 * H, window: ProviderLimitWindow.FIVE_HOUR, holding: false, enforced: true },
			],
		})
		expect(budget.ceiling(ProviderLimitWindow.FIVE_HOUR, NOW, broken)).toBe(1_000)
	})

	it('a turn accepted after a refusal and before its reset returns the ceiling to the seed (swapped account)', () => {
		const resetsAt = NOW + 2 * H
		const refusal = { at: refusedAt, window: ProviderLimitWindow.FIVE_HOUR, status: ProviderLimitStatus.REJECTED, resetsAt }
		const cutOnly = ledger({ usage: [turn(refusedAt - H, 300)], limits: [refusal] })
		expect(budget.ceiling(ProviderLimitWindow.FIVE_HOUR, NOW, cutOnly)).toBe(300)

		const swapped = ledger({
			usage: [turn(refusedAt - H, 300), turn(refusedAt + 20 * 60_000, 50, UsageRole.ISSUE, 'after')],
			limits: [refusal],
			issueRunStarts: [{ at: refusedAt + 10 * 60_000, entityId: 'after' }],
		})
		expect(budget.ceiling(ProviderLimitWindow.FIVE_HOUR, NOW, swapped)).toBe(SEED[ProviderLimitWindow.FIVE_HOUR])

		// a turn that reports soon after the refusal but STARTED before it proves nothing
		const inFlight = ledger({
			usage: [turn(refusedAt - H, 300), turn(refusedAt + 20 * 60_000, 50, UsageRole.ISSUE, 'before')],
			limits: [refusal],
			issueRunStarts: [{ at: refusedAt - 10 * 60_000, entityId: 'before' }],
		})
		expect(budget.ceiling(ProviderLimitWindow.FIVE_HOUR, NOW, inFlight)).toBeLessThan(SEED[ProviderLimitWindow.FIVE_HOUR])
	})
})
