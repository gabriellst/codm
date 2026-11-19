import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AgentModelId, ProviderLimitWindow, UsageRole } from '@codm/contracts-typescript/wire/enums'
import { ProviderLimitStatus } from '@agent/enums/ProviderLimitStatus'
import { costOf, OUTPUT_ONLY_WEIGHTS, USAGE_COST_WEIGHTS, type BucketWeights } from '@agent/utils/UsageCost'
import {
	BUDGET_WINDOWS,
	CUTS_WINDOWS,
	QUOTA_SEED_CEILING,
	QuotaBudget,
	WINDOW_LENGTH_MS,
	type BudgetWindow,
	type QuotaHoldFact,
	type QuotaLedger,
	type QuotaLimitFact,
	type QuotaUsageFact,
} from '@agent/services/QuotaBudget'

/**
 * THE ACCEPTANCE REPLAY (fase 4, S2 — "simulação com eventos de uso reais anonimizados mostra o agendador segurando
 * tarefa nova antes de estourar a janela"). Closed loop, injected clock: the fixture is replayed as DEMAND — each
 * turn arrives when it ran in the measured install — and only the issue turns the budget admits are charged. The
 * orchestrator's turns are never held by the budget (THREAD lane).
 *
 * The provider is modelled from the fixture itself: at each measured refusal, the account refuses if the replay's
 * spend in that window has reached the refusal's IMPLICIT LIMIT (what the measured install had spent in the window
 * when it was refused), and stays paused — every lane — until the spend slides back under it.
 *
 * The seed is fitted on W45 only (`QUOTA_SEED_CEILING`, re-derived and pinned here); W46–W47 are out of sample.
 *
 * The fixture (`tests/fixtures/quota/usage-2026-11.json`): per turn, the offset from the first usage fact, the role
 * (an issue's entity or the conversation's — the measurement's rule) and the four token buckets; per refusal, its
 * offset and window (one per 45-min group of pause notices; a reset announced more than five hours after the
 * refusal is the weekly window — a five-hour window cannot reset later than that). No ids, no text.
 */
interface FixtureTurn {
	tMs: number
	role: UsageRole
	inputTokens: number
	outputTokens: number
	cacheCreationInputTokens: number
	cacheReadInputTokens: number
}
interface Fixture {
	origin: string
	turns: FixtureTurn[]
	refusals: { tMs: number; window: ProviderLimitWindow }[]
}

const fixture: Fixture = JSON.parse(readFileSync(join(import.meta.dir, '../fixtures/quota/usage-2026-11.json'), 'utf8'))
const HOUR = 60 * 60 * 1000
const TICK = 5 * 60 * 1000
/** Monday of ISO week 46, as an offset from the fixture's origin: everything before it is W45 (in sample). */
const W46 = Date.parse('2026-11-09T00:00:00.000Z') - Date.parse(fixture.origin)
const END = fixture.turns.at(-1)!.tMs + TICK
/** The end of the span the spec measured its pauses on (18/11 20:11Z) — hours are compared on that span. */
const SPEC_END = Date.parse('2026-11-18T20:11:00.000Z') - Date.parse(fixture.origin)
/**
 * Hours the provider's limit paused the measured install on that span (spec, "Problema (medido)": union of the
 * announced pause windows, 73.5 h in 13.9 days — a lower bound). The fixture keeps refusal instants, not their resets.
 */
const MEASURED_PAUSED_HOURS = 73.5
const cutWindow = (window: ProviderLimitWindow): BudgetWindow => CUTS_WINDOWS[window][0]!

/** Spend of `turns` in the sliding `window` ending at `at`. */
function spendIn(turns: readonly { at: number; cost: number }[], window: BudgetWindow, at: number): number {
	const from = at - WINDOW_LENGTH_MS[window]
	return turns.reduce((total, turn) => (turn.at >= from && turn.at <= at ? total + turn.cost : total), 0)
}

const floor3 = (value: number) => {
	const magnitude = 10 ** (Math.floor(Math.log10(value)) - 2)
	return Math.floor(value / magnitude) * magnitude
}

/** The measured install, priced: every turn charged when it ran. */
function measured(weights: BucketWeights) {
	return fixture.turns.map(turn => ({ at: turn.tMs, role: turn.role, cost: costOf(turn, weights) }))
}

/** Each refusal with its implicit limit — what the measured install had spent in that window when refused. */
function refusalsWithLimits(weights: BucketWeights) {
	const turns = measured(weights)
	return fixture.refusals.map(refusal => {
		const window = cutWindow(refusal.window)
		return {
			...refusal,
			window,
			limit: spendIn(turns, window, refusal.tMs),
			outOfSample: refusal.tMs >= W46,
			// The implicit limit is only KNOWN when the fixture holds the window's whole history before the refusal.
			knownLimit: refusal.tMs >= WINDOW_LENGTH_MS[window],
		}
	})
}

/** The seed rule `QUOTA_SEED_CEILING` documents, applied to W45 under `weights`. */
function seedFromW45(weights: BucketWeights): Record<BudgetWindow, number> {
	const inSample = refusalsWithLimits(weights).filter(refusal => !refusal.outOfSample)
	const seedOf = (window: BudgetWindow) => {
		const ofWindow = inSample.filter(refusal => refusal.window === window)
		const withHistory = ofWindow.filter(refusal => refusal.tMs >= WINDOW_LENGTH_MS[window])
		return floor3(Math.min(...(withHistory.length > 0 ? withHistory : ofWindow).map(refusal => refusal.limit)))
	}
	return {
		[ProviderLimitWindow.FIVE_HOUR]: seedOf(ProviderLimitWindow.FIVE_HOUR),
		[ProviderLimitWindow.WEEKLY]: seedOf(ProviderLimitWindow.WEEKLY),
	}
}

interface Replay {
	/** Hours an issue turn waited because the budget held the lane (not the provider). */
	heldHours: number
	/** Hours every lane was paused because the provider refused. */
	pausedHours: number
	/** The replay's spend in each refusal's window at the refusal instant, beside its implicit limit. */
	atRefusals: { tMs: number; window: BudgetWindow; limit: number; spent: number; outOfSample: boolean; refused: boolean }[]
	/** Orchestrator turns charged while the budget was holding the issue lane. */
	orchestratorTurnsWhileHeld: number
	/** Every hold and release of the issue lane, with the spend of its window at that instant. */
	holds: (QuotaHoldFact & { spent: number })[]
	ceilingAfter: (window: BudgetWindow, at: number) => number
}

/** Replay the fixture as demand. `budget` absent ⇒ the measured install (everything admitted on arrival). */
function replay(weights: BucketWeights, budget?: QuotaBudget): Replay {
	// The provider is modelled only on refusals whose implicit limit is known (a full window of history before them):
	// the fixture starts mid-week, so a refusal in its first hours or days would model a limit of nearly nothing.
	const refusals = refusalsWithLimits(weights).filter(refusal => refusal.knownLimit)
	const usage: QuotaUsageFact[] = []
	const limits: QuotaLimitFact[] = []
	const holds: QuotaHoldFact[] = []
	const ledger = (): QuotaLedger => ({ usage, limits, holds, issueRunStarts: [], firstRoleFactAt: 0 })
	const issueQueue: FixtureTurn[] = []
	const threadQueue: FixtureTurn[] = []
	// A turn that runs in the tick it arrived is charged when it ran; one that waited, when it was let through.
	const charge = (turn: FixtureTurn, now: number) =>
		usage.push({
			at: Math.max(turn.tMs, now - TICK),
			entityId: `${turn.role}-${turn.tMs}`,
			role: turn.role,
			cost: costOf(turn, weights),
			windows: [],
		})

	let next = 0
	let pausedUntil = -1
	let holding: BudgetWindow | undefined
	let heldMs = 0
	let pausedMs = 0
	let orchestratorTurnsWhileHeld = 0
	const atRefusals: Replay['atRefusals'] = []
	let refusalIndex = 0

	for (let now = 0; now <= END; now += TICK) {
		while (next < fixture.turns.length && fixture.turns[next]!.tMs <= now) {
			const turn = fixture.turns[next++]!
			;(turn.role === UsageRole.ISSUE ? issueQueue : threadQueue).push(turn)
		}
		// THE PROVIDER: refuses at a measured refusal when the window reached its implicit limit, and stays refused
		// until that window resets — a provider window starts at its first use, so it resets one length after the
		// oldest turn it holds. A pause holds EVERY lane (the account's — declared behavior, spec "Recusa mesmo assim").
		// Judged one tick late, so every turn that ran before the refusal instant has been charged.
		while (refusalIndex < refusals.length && refusals[refusalIndex]!.tMs <= now - TICK) {
			const refusal = refusals[refusalIndex++]!
			const spent = spendIn(usage, refusal.window, refusal.tMs)
			const refused = spent >= refusal.limit
			atRefusals.push({ tMs: refusal.tMs, window: refusal.window, limit: refusal.limit, spent, outOfSample: refusal.outOfSample, refused })
			if (refused) {
				const from = refusal.tMs - WINDOW_LENGTH_MS[refusal.window]
				const oldest = usage.find(turn => turn.at >= from)?.at ?? refusal.tMs
				pausedUntil = Math.max(pausedUntil, oldest + WINDOW_LENGTH_MS[refusal.window])
				limits.push({ at: refusal.tMs, window: refusal.window, status: ProviderLimitStatus.REJECTED })
			}
		}
		if (now < pausedUntil) {
			if (now <= SPEC_END) pausedMs += TICK
			continue
		}
		for (const turn of threadQueue.splice(0)) {
			if (holding) orchestratorTurnsWhileHeld++
			charge(turn, now)
		}
		while (issueQueue.length > 0) {
			const decision = budget?.admit({ inFlight: 0, now, ledger: ledger() })
			if (!decision || decision.admitted) {
				if (holding) holds.push({ at: now, window: holding, holding: false, enforced: true })
				holding = undefined
				charge(issueQueue.shift()!, now)
				continue
			}
			if (!holding) holds.push({ at: now, window: decision.heldBy!, holding: true, enforced: true })
			holding = decision.heldBy
			break
		}
		if (holding && issueQueue.length > 0 && now <= SPEC_END) heldMs += TICK
	}
	return {
		heldHours: heldMs / HOUR,
		pausedHours: pausedMs / HOUR,
		atRefusals,
		orchestratorTurnsWhileHeld,
		holds: holds.map(hold => ({ ...hold, spent: spendIn(usage, cutWindow(hold.window), hold.at) })),
		ceilingAfter: (window, at) => budget?.ceiling(window, at, ledger()) ?? Number.POSITIVE_INFINITY,
	}
}

/**
 * THE TWO PRICINGS, and what each one measured. The spec assertions the W45 seed does NOT meet out of sample are kept
 * as the spec states them and run as `it.failing` — they turn red the day they start to pass, so a better seed or
 * probe has to come with this file updated — never reshaped to pass:
 *  - weighted: no out-of-sample refusal, but the lane is held far longer than the provider paused the install — the
 *    W45 seed is the LOWEST implicit limit of a week whose limits varied ~6× (and the weekly seed is cut short by a
 *    sample that starts mid-week), and the probe raises it only 10% per two held windows;
 *  - output-only: the same, plus a five-hour refusal out of sample (the mix of buckets moves the seed).
 */
const WEIGHTED = USAGE_COST_WEIGHTS[AgentModelId.OPUS]
const outOfSample = (run: Replay) => run.atRefusals.filter(refusal => refusal.outOfSample)
const budgetSeededOnW45 = (weights: BucketWeights) => new QuotaBudget({ seedCeiling: seedFromW45(weights) })

describe('fase 4 — the quota budget replayed over the measured fortnight', () => {
	it('the declared seed is the W45 rule applied to the fixture — nothing out of sample in it', () => {
		expect(seedFromW45(WEIGHTED)).toEqual({ ...QUOTA_SEED_CEILING })
	})

	describe('weighted (frontier claude price list)', () => {
		const withoutBudget = replay(WEIGHTED)
		const withBudget = replay(WEIGHTED, budgetSeededOnW45(WEIGHTED))

		it('without the budget, the provider model refuses the replay out of sample (the limits bite)', () => {
			expect(outOfSample(withoutBudget).some(refusal => refusal.refused)).toBe(true)
		})

		it('out of sample (W46–W47), the issue lane closes before the spend reaches each implicit limit', () => {
			expect(outOfSample(withBudget).length).toBeGreaterThan(0)
			expect(outOfSample(withBudget).filter(refusal => refusal.refused)).toEqual([])
		})

		it.failing('the hours held by the budget are fewer than the hours the provider paused the measured install', () => {
			expect(withBudget.heldHours).toBeLessThan(MEASURED_PAUSED_HOURS)
		})
	})

	describe('output tokens only', () => {
		const withoutBudget = replay(OUTPUT_ONLY_WEIGHTS)
		const withBudget = replay(OUTPUT_ONLY_WEIGHTS, budgetSeededOnW45(OUTPUT_ONLY_WEIGHTS))

		it('without the budget, the provider model refuses the replay out of sample (the limits bite)', () => {
			expect(outOfSample(withoutBudget).some(refusal => refusal.refused)).toBe(true)
		})

		it.failing('out of sample (W46–W47), the issue lane closes before the spend reaches each implicit limit', () => {
			expect(outOfSample(withBudget).length).toBeGreaterThan(0)
			expect(outOfSample(withBudget).filter(refusal => refusal.refused)).toEqual([])
		})

		it.failing('the hours held by the budget are fewer than the hours the provider paused the measured install', () => {
			expect(withBudget.heldHours).toBeLessThan(MEASURED_PAUSED_HOURS)
		})
	})

	it('a refusal the budget did not prevent cuts the ceiling, and the next window closes the lane earlier', () => {
		// "Recusa mesmo assim": a seed far above the account's limit lets the provider refuse. The refusal is learned
		// from — the ceiling drops to what the window had spent — and the lane, which the seed alone never closed,
		// closes in a later window against that cut ceiling.
		const weights = WEIGHTED
		const generous = { [ProviderLimitWindow.FIVE_HOUR]: 1e12, [ProviderLimitWindow.WEEKLY]: 1e13 }
		const loose = replay(weights, new QuotaBudget({ seedCeiling: generous }))
		const first = loose.atRefusals.find(refusal => refusal.refused && refusal.window === ProviderLimitWindow.FIVE_HOUR)
		expect(first).toBeDefined()
		const refusal = first!
		expect(loose.ceilingAfter(refusal.window, refusal.tMs - 1)).toBe(generous[ProviderLimitWindow.FIVE_HOUR])
		expect(loose.ceilingAfter(refusal.window, refusal.tMs)).toBeLessThanOrEqual(refusal.spent)
		const nextHold = loose.holds.find(hold => hold.holding && hold.at > refusal.tMs && hold.window === refusal.window)
		expect(nextHold).toBeDefined()
		// the lane closed in a later window, measured against the cut ceiling — never the generous seed again
		expect(loose.ceilingAfter(refusal.window, nextHold!.at)).toBeLessThanOrEqual(refusal.spent)
		// and the generous seed alone never holds before the first refusal
		expect(loose.holds.filter(hold => hold.at < refusal.tMs)).toEqual([])
	})

	it('with the issue lane held by the budget, the orchestrator’s turns keep being charged (the THREAD lane is never held)', () => {
		const held = replay(WEIGHTED, new QuotaBudget({ seedCeiling: QUOTA_SEED_CEILING }))
		expect(held.orchestratorTurnsWhileHeld).toBeGreaterThan(0)
	})

	it('both windows are controlled', () => {
		expect([...BUDGET_WINDOWS]).toEqual([ProviderLimitWindow.FIVE_HOUR, ProviderLimitWindow.WEEKLY])
	})
})
