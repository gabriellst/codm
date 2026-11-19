import { ProviderLimitWindow, UsageRole } from '@codm/contracts-typescript/wire/enums'
import { ProviderLimitStatus } from '../../enums/ProviderLimitStatus'
import type { QuotaLedger, QuotaUsageFact } from './QuotaLedger'

/** The two windows the budget controls. `UNKNOWN` is not a window — it is a refusal that did not say which. */
export type BudgetWindow = ProviderLimitWindow.FIVE_HOUR | ProviderLimitWindow.WEEKLY
export const BUDGET_WINDOWS: readonly BudgetWindow[] = [ProviderLimitWindow.FIVE_HOUR, ProviderLimitWindow.WEEKLY]

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** How long each window lasts — the sliding width when the facts carry no boundary of it. */
export const WINDOW_LENGTH_MS: Readonly<Record<BudgetWindow, number>> = {
	[ProviderLimitWindow.FIVE_HOUR]: 5 * HOUR_MS,
	[ProviderLimitWindow.WEEKLY]: 7 * DAY_MS,
}

/**
 * WHICH CEILINGS A PROVIDER VERDICT ABOUT A WINDOW CUTS. A refusal that does not say its window (codex reports no
 * type) cuts only the five-hour window: cutting the week on it would hold tasks for days on one unlabeled refusal.
 */
export const CUTS_WINDOWS: Readonly<Record<ProviderLimitWindow, readonly BudgetWindow[]>> = {
	[ProviderLimitWindow.FIVE_HOUR]: [ProviderLimitWindow.FIVE_HOUR],
	[ProviderLimitWindow.WEEKLY]: [ProviderLimitWindow.WEEKLY],
	[ProviderLimitWindow.UNKNOWN]: [ProviderLimitWindow.FIVE_HOUR],
}

/**
 * THE SEED CEILING of each window, in the budget's unit (`UsageCost`, frontier-claude input tokens). Fitted on the
 * FIRST WEEK of the measurement only (W45, `tests/fixtures/quota/usage-2026-11.json`) — W46–W47 stay out of sample
 * for the acceptance replay. Rule: the LOWEST implicit limit among that week's refusals of the window (spend in the
 * window before the refusal), counting only refusals with a full window of history in the sample — and, for the
 * week, which has none (the sample starts on a Wednesday), every refusal: an under-estimate, since the days before
 * the sample are missing. Rounded down to three significant digits. The replay re-derives both by the same rule and
 * pins them to these numbers.
 */
export const QUOTA_SEED_CEILING: Readonly<Record<BudgetWindow, number>> = {
	[ProviderLimitWindow.FIVE_HOUR]: 11_300_000,
	[ProviderLimitWindow.WEEKLY]: 265_000_000,
}

/**
 * THE CUT a provider verdict makes, as a multiple of what the window had spent (plus the projection of the turns in
 * flight). A refusal is the limit itself; a warning says the window is close, so the ceiling is set a declared
 * step above the spend (`allowed_warning` was never captured in the measurement — a supposition the observation
 * week checks). `ALLOWED` cuts nothing: its line only carries the window's boundary.
 */
export const CUT_FACTOR: Readonly<Record<ProviderLimitStatus, number | null>> = {
	[ProviderLimitStatus.REJECTED]: 1,
	[ProviderLimitStatus.WARNING]: 1.1,
	[ProviderLimitStatus.ALLOWED]: null,
}

/** The upward probe: after this many windows in a row that ended with no refusal AND with the lane held… */
export const QUOTA_PROBE_AFTER = 2
/** …the ceiling rises by this fraction. The next refusal cuts it back. */
export const QUOTA_PROBE_STEP = 0.1

/** The owner's rule (fase 4, item 3): the orchestrator keeps at least this share of the ceiling free. */
export const QUOTA_RESERVE_MIN_SHARE = 0.05
/**
 * The orchestrator's MEASURED share until the store has a week of role-stamped facts — the measurement's
 * (`ORCHESTRATOR` 18.6% of the weighted spend, 04–18/11, before fase 3). Replaced by the live figure as soon as
 * there are seven days of facts to measure it on.
 */
export const QUOTA_RESERVE_START_SHARE = 0.186
/** The span the orchestrator's share is measured over. */
export const QUOTA_RESERVE_MEASURE_MS = 7 * DAY_MS
/** Which roles the reserve is FOR — the orchestrator and the triage that serves it; never the tasks. */
export const RESERVED_ROLES: Readonly<Record<UsageRole, boolean>> = {
	[UsageRole.ORCHESTRATOR]: true,
	[UsageRole.TRIAGE]: true,
	[UsageRole.ISSUE]: false,
}

/** How many recent issue turns the expected cost averages — the MEAN, not the median: the tail is heavy (p90 ≈ 8×). */
export const EXPECTED_COST_SAMPLE = 50
/**
 * The longest an issue turn is believed in flight — the dispatcher's renewal ceiling (`MAX_TURN_MS`). A run start
 * older than this with no usage after it is no longer counted as in flight at a refusal.
 */
export const IN_FLIGHT_HORIZON_MS = HOUR_MS
/**
 * A turn that reported usage this long after a refusal STARTED after it (no turn outlives the renewal ceiling) — so,
 * before the refusal's reset, it is evidence the account was swapped or the window reset early.
 */
export const ACCOUNT_SWAP_AFTER_MS = HOUR_MS

/** One window's account at an instant, in the budget's unit. */
export interface WindowAccount {
	window: BudgetWindow
	/** Everything spent in the window. */
	spent: number
	/** What the tasks spent. */
	issueSpent: number
	/** What the orchestrator and the triage spent. */
	reservedSpent: number
	/** The learned ceiling. */
	ceiling: number
	/** The floor kept free for the orchestrator: `max(reserveShare × ceiling, reservedSpent)`. */
	reserveFloor: number
	/** When the window resets, when a fact said so. */
	resetsAt?: number
}

export interface Admission {
	admitted: boolean
	/** The first window that would not fit one more issue turn — absent when admitted. */
	heldBy?: BudgetWindow
	/** The expected cost of one issue turn the decision used. */
	expectedTurnCost: number
	/** The reserve share in force (`max(5%, measured)`). */
	reserveShare: number
	accounts: Readonly<Record<BudgetWindow, WindowAccount>>
}

/** The tunables, overridable as a whole by a test or the replay (output-only weights need their own seed). */
export interface QuotaBudgetPolicy {
	seedCeiling: Readonly<Record<BudgetWindow, number>>
}

/**
 * THE QUOTA BUDGET (fase 4, item 2) — does one more ISSUE turn fit in BOTH provider windows, with the orchestrator's
 * floor kept free? Pure: every answer is derived from the ledger handed in (`QuotaLedgerReader`), nothing is stored,
 * and the clock is an argument. Global for the account, not per provider — the dispatcher cannot know which CLI an
 * item runs on before claiming it, the same reason its pause is global.
 *
 * Admission, per window: `issueSpent + inFlight × expected + expected ≤ ceiling − max(reserve × ceiling,
 * reservedSpent)`. The reserve is a FLOOR KEPT FREE, not a share the orchestrator already spent and gets again.
 *
 * The ceiling is LEARNED, per window, by a fold over the facts: it starts at the seed; a refusal cuts it to what the
 * window had spent plus the projection of the issue turns in flight (they only report at the end, so the spend at
 * the refusal under-counts); a warning cuts it a step above that; after `QUOTA_PROBE_AFTER` windows in a row with
 * no refusal and the lane held (or, in observation, would-have-held) it rises `QUOTA_PROBE_STEP`; and a turn
 * accepted after a refusal but before its reset — a swapped account, or a window reset early — returns it to the
 * seed.
 */
export class QuotaBudget {
	constructor(private readonly policy: QuotaBudgetPolicy = { seedCeiling: QUOTA_SEED_CEILING }) {}

	/** The window's span at `now`: from its last reported boundary when one is ahead, else sliding. */
	window(window: BudgetWindow, now: number, ledger: QuotaLedger): { from: number; resetsAt?: number } {
		const resetsAt = this.boundaryAhead(window, now, ledger)
		return resetsAt === undefined ? { from: now - WINDOW_LENGTH_MS[window] } : { from: resetsAt - WINDOW_LENGTH_MS[window], resetsAt }
	}

	/** Every window's account at `now`. */
	accounts(now: number, ledger: QuotaLedger): Record<BudgetWindow, WindowAccount> {
		const share = this.reserveShare(now, ledger)
		const accountOf = (window: BudgetWindow): WindowAccount => {
			const span = this.window(window, now, ledger)
			const inside = ledger.usage.filter(fact => fact.at >= span.from && fact.at <= now)
			const reservedSpent = sum(inside.filter(fact => RESERVED_ROLES[fact.role]))
			const ceiling = this.ceiling(window, now, ledger)
			return {
				window,
				spent: sum(inside),
				issueSpent: sum(inside.filter(fact => !RESERVED_ROLES[fact.role])),
				reservedSpent,
				ceiling,
				reserveFloor: Math.max(share * ceiling, reservedSpent),
				...(span.resetsAt !== undefined && { resetsAt: span.resetsAt }),
			}
		}
		return {
			[ProviderLimitWindow.FIVE_HOUR]: accountOf(ProviderLimitWindow.FIVE_HOUR),
			[ProviderLimitWindow.WEEKLY]: accountOf(ProviderLimitWindow.WEEKLY),
		}
	}

	/** Does one more issue turn fit, with `inFlight` issue turns already running? */
	admit({ inFlight, now, ledger }: { inFlight: number; now: number; ledger: QuotaLedger }): Admission {
		const expected = this.expectedTurnCost(now, ledger)
		const accounts = this.accounts(now, ledger)
		const heldBy = BUDGET_WINDOWS.find(window => {
			const account = accounts[window]
			return account.issueSpent + inFlight * expected + expected > account.ceiling - account.reserveFloor
		})
		return {
			admitted: heldBy === undefined,
			...(heldBy !== undefined && { heldBy }),
			expectedTurnCost: expected,
			reserveShare: this.reserveShare(now, ledger),
			accounts,
		}
	}

	/**
	 * When `window` is expected to admit one more issue turn again: the reset the provider reported, else the instant
	 * enough of the tasks' spend slides out of it. `undefined` when no slide frees enough (the ceiling itself is short).
	 */
	reopensAt(window: BudgetWindow, { inFlight, now, ledger }: { inFlight: number; now: number; ledger: QuotaLedger }): number | undefined {
		const account = this.accounts(now, ledger)[window]
		if (account.resetsAt !== undefined) return account.resetsAt
		const expected = this.expectedTurnCost(now, ledger)
		let excess = account.issueSpent + (inFlight + 1) * expected - (account.ceiling - account.reserveFloor)
		if (excess <= 0) return now
		const from = now - WINDOW_LENGTH_MS[window]
		for (const fact of ledger.usage) {
			if (fact.at < from || fact.at > now || RESERVED_ROLES[fact.role]) continue
			excess -= fact.cost
			if (excess <= 0) return fact.at + WINDOW_LENGTH_MS[window]
		}
		return undefined
	}

	/** The mean cost of the last `EXPECTED_COST_SAMPLE` issue turns that spent anything, up to `now` (0 with none). */
	expectedTurnCost(now: number, ledger: QuotaLedger): number {
		const recent = ledger.usage.filter(fact => fact.at <= now && !RESERVED_ROLES[fact.role] && fact.cost > 0).slice(-EXPECTED_COST_SAMPLE)
		return recent.length === 0 ? 0 : sum(recent) / recent.length
	}

	/**
	 * `max(5%, measured)`: the orchestrator's (and triage's) share of the spend over the last seven days — once the
	 * store has seven days of role-stamped facts; before that, the measurement's starting figure.
	 */
	reserveShare(now: number, ledger: QuotaLedger): number {
		const measuredSince = now - QUOTA_RESERVE_MEASURE_MS
		const hasAWeek = ledger.firstRoleFactAt !== undefined && ledger.firstRoleFactAt <= measuredSince
		if (!hasAWeek) return Math.max(QUOTA_RESERVE_MIN_SHARE, QUOTA_RESERVE_START_SHARE)
		const week = ledger.usage.filter(fact => fact.at > measuredSince && fact.at <= now)
		const total = sum(week)
		const measured = total === 0 ? 0 : sum(week.filter(fact => RESERVED_ROLES[fact.role])) / total
		return Math.max(QUOTA_RESERVE_MIN_SHARE, measured)
	}

	/** The learned ceiling of `window` at `now` — the fold described on the class. */
	ceiling(window: BudgetWindow, now: number, ledger: QuotaLedger): number {
		const seed = this.policy.seedCeiling[window]
		const length = WINDOW_LENGTH_MS[window]
		interface Step {
			at: number
			apply: (ceiling: number) => number
		}
		const steps: Step[] = []
		for (const limit of ledger.limits) {
			const factor = CUT_FACTOR[limit.status]
			if (limit.at > now || factor === null || !CUTS_WINDOWS[limit.window].includes(window)) continue
			const cut =
				(this.spentAt(window, limit.at, ledger) + this.inFlightAt(limit.at, ledger) * this.expectedTurnCost(limit.at, ledger)) * factor
			steps.push({ at: limit.at, apply: ceiling => Math.min(ceiling, cut) })
			const swappedAt =
				limit.status === ProviderLimitStatus.REJECTED ? this.acceptedBeforeReset(limit.at, limit.resetsAt, now, ledger) : undefined
			if (swappedAt !== undefined) steps.push({ at: swappedAt, apply: () => seed })
		}
		steps.sort((a, b) => a.at - b.at)

		let ceiling = seed
		let streak = 0
		const heldSpans = this.heldSpans(window, now, ledger)
		/** Walk the whole windows between two verdicts: each one that saw the lane held extends the streak. */
		const probeThrough = (from: number, to: number) => {
			for (let start = from; start + length <= to; start += length) {
				const held = heldSpans.some(span => span.from < start + length && span.to >= start)
				streak = held ? streak + 1 : 0
				if (streak >= QUOTA_PROBE_AFTER) {
					ceiling *= 1 + QUOTA_PROBE_STEP
					streak = 0
				}
			}
		}
		let since = heldSpans[0]?.from ?? now
		for (const step of steps) {
			probeThrough(since, step.at)
			ceiling = step.apply(ceiling)
			streak = 0
			since = step.at
		}
		probeThrough(since, now)
		return ceiling
	}

	/**
	 * The spans the lane was held by `window` (or would have been, in observation): from each hold to the next
	 * release, or to `now` while it lasts.
	 */
	private heldSpans(window: BudgetWindow, now: number, ledger: QuotaLedger): { from: number; to: number }[] {
		const spans: { from: number; to: number }[] = []
		let openedAt: number | undefined
		for (const fact of ledger.holds) {
			if (fact.at > now || !CUTS_WINDOWS[fact.window].includes(window)) continue
			if (fact.holding) openedAt ??= fact.at
			else if (openedAt !== undefined) {
				spans.push({ from: openedAt, to: fact.at })
				openedAt = undefined
			}
		}
		if (openedAt !== undefined) spans.push({ from: openedAt, to: now })
		return spans
	}

	/** Spend in `window` as it stood at `at` — every role: the provider counts the whole account. */
	private spentAt(window: BudgetWindow, at: number, ledger: QuotaLedger): number {
		const span = this.window(window, at, ledger)
		return sum(ledger.usage.filter(fact => fact.at >= span.from && fact.at <= at))
	}

	/** Issue turns started within the horizon before `at` that had not reported by `at`. */
	private inFlightAt(at: number, ledger: QuotaLedger): number {
		const latestStart = new Map<string, number>()
		for (const start of ledger.issueRunStarts) {
			if (start.at > at || start.at < at - IN_FLIGHT_HORIZON_MS) continue
			latestStart.set(start.entityId, Math.max(latestStart.get(start.entityId) ?? 0, start.at))
		}
		let running = 0
		for (const [entityId, startedAt] of latestStart) {
			const reported = ledger.usage.some(
				fact => fact.entityId === entityId && !RESERVED_ROLES[fact.role] && fact.at >= startedAt && fact.at <= at,
			)
			if (!reported) running++
		}
		return running
	}

	/**
	 * The first turn the account ACCEPTED after the refusal at `refusedAt` and before its reset — a turn that started
	 * after the refusal: an issue turn started after it, or any turn reporting past `ACCOUNT_SWAP_AFTER_MS`.
	 */
	private acceptedBeforeReset(refusedAt: number, resetsAt: number | undefined, now: number, ledger: QuotaLedger): number | undefined {
		if (resetsAt === undefined) return undefined
		const startsAfterRefusal = new Map<string, number[]>()
		for (const start of ledger.issueRunStarts) {
			if (start.at <= refusedAt || start.at >= resetsAt) continue
			startsAfterRefusal.set(start.entityId, [...(startsAfterRefusal.get(start.entityId) ?? []), start.at])
		}
		const startedAfter = (fact: QuotaUsageFact) =>
			fact.at - refusedAt >= ACCOUNT_SWAP_AFTER_MS ||
			(!RESERVED_ROLES[fact.role] && (startsAfterRefusal.get(fact.entityId) ?? []).some(startedAt => startedAt <= fact.at))
		return ledger.usage.find(fact => fact.at > refusedAt && fact.at < resetsAt && fact.at <= now && fact.cost > 0 && startedAfter(fact))?.at
	}

	/** The latest boundary of `window` a fact reported at or before `now` that is still ahead of it. */
	private boundaryAhead(window: BudgetWindow, now: number, ledger: QuotaLedger): number | undefined {
		let latest: number | undefined
		const consider = (reportedAt: number, reported: ProviderLimitWindow, resetsAt: number | undefined) => {
			if (resetsAt === undefined || reportedAt > now || reported !== window || resetsAt <= now) return
			latest = latest === undefined ? resetsAt : Math.max(latest, resetsAt)
		}
		for (const fact of ledger.usage) for (const boundary of fact.windows) consider(fact.at, boundary.window, boundary.resetsAt)
		for (const limit of ledger.limits) consider(limit.at, limit.window, limit.resetsAt)
		return latest
	}
}

function sum(facts: readonly { cost: number }[]): number {
	return facts.reduce((total, fact) => total + fact.cost, 0)
}
