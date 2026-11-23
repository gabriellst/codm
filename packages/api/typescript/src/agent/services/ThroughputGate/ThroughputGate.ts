import { injectable } from 'tsyringe-neo'
import { DatabaseDriver, DomainEventRepository, LoggingService } from '@codm/core-typescript'
import { SlotLimit } from '@codm/contracts-typescript/wire/enums'
import { ProductConfig } from '@shared/config/ProductConfig'
import { QuotaMode } from '../../enums/QuotaMode'
import { AgentQuotaHeldEvent, AgentQuotaReleasedEvent } from '../../events/AgentQuotaHeldEvent'
import { IssueWorktreeJanitor, WORKTREE_JANITOR_INTERVAL_MS } from '../IssueWorktreeJanitor'
import { issueSlotsFor, MachineCapacity, type MachineSample } from '../MachineCapacity'
import {
	type Admission,
	type BudgetWindow,
	CUTS_WINDOWS,
	QuotaBudget,
	QUOTA_LEDGER_HORIZON_MS,
	QuotaLedgerReader,
	type QuotaLedger,
} from '../QuotaBudget'
import { InMemoryQuotaStatus } from '../QuotaStatusReader'

/** How often the budget re-reads its facts — a settled turn asks for a re-read, at most this often. */
export const QUOTA_LEDGER_REFRESH_MS = 60_000
/** The fastest a settled turn can force a re-read. */
const QUOTA_LEDGER_MIN_REFRESH_MS = 5_000
/** The longest one admission is reused while neither the ledger nor the turns in flight changed. */
export const ADMISSION_REUSE_MS = 15_000
/** How often the machine (free disk, memory) is sampled. */
export const MACHINE_SAMPLE_MS = 60_000

/**
 * WHAT EACH MODE DOES WITH A DENIED ADMISSION (fase 4, revisão 2) — declared tables, never an `if` on the mode where
 * it is used. Observation holds nothing and says nothing; its facts carry `enforced: false`.
 */
export const HOLDS_LANE: Readonly<Record<QuotaMode, boolean>> = { [QuotaMode.ENFORCE]: true, [QuotaMode.OBSERVE]: false }
export const ANNOUNCES_HOLD: Readonly<Record<QuotaMode, boolean>> = { [QuotaMode.ENFORCE]: true, [QuotaMode.OBSERVE]: false }
const QUOTA_MODE_OF: Readonly<Record<`${boolean}`, QuotaMode>> = { true: QuotaMode.ENFORCE, false: QuotaMode.OBSERVE }

/** The task lane as the dispatcher must open it on this loop. */
export interface IssueLane {
	/** How many task turns may be in flight now. */
	slots: number
	limitedBy: SlotLimit
	/** Present while the budget holds the lane FOR REAL — and the groups owed a notice should get one. */
	announce?: { window: BudgetWindow; reopensAt?: Date }
}

/**
 * THE TASK LANE'S GATE (fase 4, S3) — everything that decides how many task turns may run, in one place the dispatcher
 * asks once per loop, BEFORE `claimNext` (never claim-and-give-back):
 *  - the configured maximum (`CODM_AGENT_ISSUE_SLOTS_MAX`, the dispatcher's lane);
 *  - the machine (`MachineCapacity` → `ISSUE_SLOTS_BY_DISK`), sampled every `MACHINE_SAMPLE_MS` — and the worktree
 *    janitor sweeps first (at boot and every `WORKTREE_JANITOR_INTERVAL_MS`), so the sample after it sees the disk it
 *    freed;
 *  - the quota budget (`QuotaBudget` over `QuotaLedgerReader`, cached), whose denial closes the lane only when
 *    ENFORCED (`HOLDS_LANE`).
 * Effective = the minimum of the three, with `limitedBy` naming the binding one. Every admission transition is a fact
 * (`agent.quota.held` / `agent.quota.released`, `enforced` from the mode) — in observation that fact is the whole
 * effect. The THREAD lane never passes here.
 *
 * Never rejects: a failed read keeps the last answer (or the open lane on the first loop) and is logged — a broken
 * budget must not silence the queue.
 */
@injectable()
export class ThroughputGate {
	/** The budget's arithmetic — a field so a test can seed it; production never reassigns it. */
	protected budget = new QuotaBudget()
	protected mode: QuotaMode = QUOTA_MODE_OF[`${ProductConfig.env.CODM_AGENT_QUOTA_ENFORCE}`]

	private ledger: QuotaLedger | undefined
	private ledgerReadAt = 0
	private ledgerStale = false
	private machine: MachineSample | undefined
	private machineReadAt = 0
	private janitorDueAt = 0
	private sweeping: Promise<unknown> | undefined
	/**
	 * The window currently holding — `undefined` while the budget admits. Seeded from the ledger's last hold fact on
	 * the first read: a hold a previous run left open is closed by a release, never left to run on to "now" (the
	 * probe would count it as demand).
	 */
	private holding: BudgetWindow | undefined
	private holdingSeeded = false
	/** The last admission and what it was computed on — the budget is a fold over weeks of facts, not a per-loop sum. */
	private lastAdmission: { admission: Admission; ledger: QuotaLedger; inFlight: number; at: number } | undefined

	constructor(
		private readonly ledgerReader: QuotaLedgerReader,
		private readonly machineCapacity: MachineCapacity,
		private readonly janitor: IssueWorktreeJanitor,
		private readonly status: InMemoryQuotaStatus,
		private readonly driver: DatabaseDriver,
		private readonly events: DomainEventRepository,
		private readonly logging: LoggingService,
	) {}

	/** A turn settled: its spend is a new fact — re-read the ledger on the next loop (throttled). */
	turnSettled(): void {
		this.ledgerStale = true
	}

	/** How the task lane opens now, with `inFlight` task turns running and `max` slots configured. */
	async issueLane({
		inFlight,
		max,
		providerRefusing,
		providerPausedUntil,
		now = Date.now(),
	}: {
		inFlight: number
		max: number
		providerRefusing: boolean
		/** Until when the dispatcher's usage-limit pause holds (epoch ms), while it does — published for the readers. */
		providerPausedUntil?: number
		now?: number
	}): Promise<IssueLane> {
		this.sweepWhenDue(now)
		const [ledger, machine] = await Promise.all([this.ledgerAt(now), this.machineAt(now)])
		const admission = this.admissionAt(ledger, inFlight, now)
		await this.recordTransition(admission, now)

		const machineSlots = issueSlotsFor(machine)
		const budgetSlots = HOLDS_LANE[this.mode] && !admission.admitted ? 0 : max
		const slots = Math.min(max, machineSlots, budgetSlots)
		const limitedBy =
			budgetSlots === slots && budgetSlots < max
				? SlotLimit.BUDGET
				: machineSlots === slots && machineSlots < max
					? SlotLimit.MACHINE
					: SlotLimit.MAX
		const enforced = HOLDS_LANE[this.mode]
		this.status.publish({
			at: now,
			enforced,
			admission,
			slots: { inUse: inFlight, max, effective: slots, limitedBy },
			diskFreeBytes: machine.diskFreeBytes,
			providerRefusing,
			...(providerPausedUntil !== undefined && { providerPausedUntil }),
		})
		if (admission.admitted || !ANNOUNCES_HOLD[this.mode] || admission.heldBy === undefined) return { slots, limitedBy }
		const reopensAt = this.budget.reopensAt(admission.heldBy, { inFlight, now, ledger })
		return { slots, limitedBy, announce: { window: admission.heldBy, ...(reopensAt !== undefined && { reopensAt: new Date(reopensAt) }) } }
	}

	/** The budget's answer — reused while the same ledger and the same turns in flight stand, for `ADMISSION_REUSE_MS`. */
	private admissionAt(ledger: QuotaLedger, inFlight: number, now: number): Admission {
		const last = this.lastAdmission
		if (last && last.ledger === ledger && last.inFlight === inFlight && now - last.at < ADMISSION_REUSE_MS) return last.admission
		const admission = this.budget.admit({ inFlight, now, ledger })
		this.lastAdmission = { admission, ledger, inFlight, at: now }
		return admission
	}

	/** At boot and every `WORKTREE_JANITOR_INTERVAL_MS`: sweep in the background, then resample the disk it freed. */
	private sweepWhenDue(now: number): void {
		if (now < this.janitorDueAt || this.sweeping) return
		this.janitorDueAt = now + WORKTREE_JANITOR_INTERVAL_MS
		this.sweeping = this.janitor.sweep(new Date(now)).finally(() => {
			this.sweeping = undefined
			this.machineReadAt = 0
		})
	}

	private async ledgerAt(now: number): Promise<QuotaLedger> {
		const age = now - this.ledgerReadAt
		const due = this.ledger === undefined || age >= QUOTA_LEDGER_REFRESH_MS || (this.ledgerStale && age >= QUOTA_LEDGER_MIN_REFRESH_MS)
		if (!due) return this.ledger!
		try {
			this.ledger = await this.ledgerReader.read(new Date(now - QUOTA_LEDGER_HORIZON_MS))
			this.ledgerReadAt = now
			this.ledgerStale = false
			if (!this.holdingSeeded) {
				const last = this.ledger.holds.at(-1)
				this.holding = last?.holding ? (CUTS_WINDOWS[last.window][0] ?? undefined) : undefined
				this.holdingSeeded = true
			}
		} catch (error) {
			this.logging.error({ content: { message: 'quota ledger read failed — the last one stands', error: String(error) } })
		}
		return this.ledger ?? { usage: [], limits: [], holds: [], issueRunStarts: [] }
	}

	private async machineAt(now: number): Promise<MachineSample> {
		if (this.machine === undefined || now - this.machineReadAt >= MACHINE_SAMPLE_MS) {
			try {
				this.machine = await this.machineCapacity.sample()
				this.machineReadAt = now
			} catch (error) {
				this.logging.error({ content: { message: 'machine sample failed — the last one stands', error: String(error) } })
			}
		}
		return this.machine ?? { diskFreeBytes: 0, memoryFreeShare: 0 }
	}

	/** Record "admitted → denied" and back as facts — and in the cached ledger at once, so the probe sees it. */
	private async recordTransition(admission: Admission, now: number): Promise<void> {
		const window = admission.heldBy ?? this.holding
		if (window === undefined || (admission.admitted && this.holding === undefined) || (!admission.admitted && this.holding !== undefined))
			return
		const account = admission.accounts[window]
		const payload = {
			window,
			spent: account.spent,
			ceiling: account.ceiling,
			reserve: account.reserveFloor,
			enforced: HOLDS_LANE[this.mode],
		}
		const fact = admission.admitted ? new AgentQuotaReleasedEvent({ payload }) : new AgentQuotaHeldEvent({ payload })
		this.holding = admission.admitted ? undefined : window
		this.logging.info({
			content: { message: admission.admitted ? 'quota budget admits task turns again' : 'quota budget denied a task turn', ...payload },
		})
		if (this.ledger)
			this.ledger = {
				...this.ledger,
				holds: [...this.ledger.holds, { at: now, window, holding: !admission.admitted, enforced: payload.enforced }],
			}
		try {
			await this.driver.unitOfWorkFactory.create().transaction(async tx => {
				await this.events.save(fact, tx)
			})
		} catch (error) {
			this.logging.error({ content: { message: 'could not record the quota transition', error: String(error) } })
		}
	}
}
