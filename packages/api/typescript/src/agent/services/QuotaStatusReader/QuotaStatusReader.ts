import { injectable } from 'tsyringe-neo'
import { MailboxTargetKind, ProviderLimitWindow, QuotaState, type SlotLimit } from '@codm/contracts-typescript/wire/enums'
import { MailboxRepository } from '../../repositories/MailboxRepository'
import type { Admission } from '../QuotaBudget'

/** At or above this share of the learned weekly ceiling, the health shows `NEAR` (spec, "Semanal"). */
export const QUOTA_NEAR_WEEK_SHARE = 0.7

/** The dispatcher's last word on the task lane — what the health, the board and the panel read. */
export interface QuotaStatus {
	/** When it was computed (epoch ms). */
	at: number
	/** Whether the budget holds for real (`CODM_AGENT_QUOTA_ENFORCE`) or only observes. */
	enforced: boolean
	/** The budget's last admission. */
	admission: Admission
	/** Task slots: in flight, the configured maximum, the effective number and what limits it. */
	slots: { inUse: number; max: number; effective: number; limitedBy: SlotLimit }
	/** Free bytes on the data volume at the last sample. */
	diskFreeBytes: number
	/** Whether the provider is refusing the account right now (the dispatcher's usage-limit pause). */
	providerRefusing: boolean
}

/**
 * The agent's READ port for the quota and the slots (fase 4, S3) — for `issue` (`WAITING_BUDGET`, the board) and
 * `ui` (the console health, S9). In memory: it is the dispatcher's live state, the same way the pause is; after a
 * restart the first loop of the dispatcher writes it again.
 */
export abstract class QuotaStatusReader {
	/** The last status, or `undefined` before the dispatcher's first loop. */
	abstract current(): QuotaStatus | undefined

	/** Tasks with work waiting in the queue, and how many of them only the budget is holding (all, while it holds). */
	abstract queue(): Promise<{ pending: number; heldByBudget: number }>

	/**
	 * Whether the task lane is held by the budget FOR REAL — enforced and not admitting. In observation this is
	 * always `false`: nothing is held, so no task is `WAITING_BUDGET`.
	 */
	holdsIssueLane(): boolean {
		const status = this.current()
		return status?.enforced === true && !status.admission.admitted
	}
}

/** The health badge of a status: the provider's refusal first, then a real hold, then the week's 70%. */
export function quotaStateOf(status: QuotaStatus): QuotaState {
	if (status.providerRefusing) return QuotaState.REFUSED
	if (status.enforced && !status.admission.admitted) return QuotaState.HOLDING
	const week = status.admission.accounts[ProviderLimitWindow.WEEKLY]
	return week.spent >= QUOTA_NEAR_WEEK_SHARE * week.ceiling ? QuotaState.NEAR : QuotaState.OK
}

/** The in-memory board the dispatcher writes and every reader reads. One instance per process. */
@injectable()
export class InMemoryQuotaStatus extends QuotaStatusReader {
	private status: QuotaStatus | undefined

	constructor(private readonly mailbox: MailboxRepository) {
		super()
	}

	async queue(): Promise<{ pending: number; heldByBudget: number }> {
		const pending = (await this.mailbox.pendingTargets(MailboxTargetKind.ISSUE)).length
		return { pending, heldByBudget: this.holdsIssueLane() ? pending : 0 }
	}

	publish(status: QuotaStatus): void {
		this.status = status
	}

	current(): QuotaStatus | undefined {
		return this.status
	}
}
