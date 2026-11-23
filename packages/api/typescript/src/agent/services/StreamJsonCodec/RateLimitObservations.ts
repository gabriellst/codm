import type { ProviderLimitWindow } from '@codm/contracts-typescript/wire/enums'
import { ProviderLimitStatus } from '../../enums/ProviderLimitStatus'
import type { LimitWindowBoundary, ObservedProviderLimit } from '../../types/AgentRuntimeEvent'
import type { RateLimitRecord } from './FrameDecoder'

/**
 * Everything a run heard about the account's usage limits (fase 4, item 2), PER WINDOW: the last verdict on each
 * window the provider named — so a refusal of the 5-hour window is not erased by a later `allowed` line about the
 * weekly one — and the last boundary of each, `allowed` lines included, which the usage fact persists so the budget
 * knows where each window starts. Pure: fed record by record by the runner, read once when the run ends.
 */
export class RateLimitObservations {
	private readonly verdicts = new Map<ProviderLimitWindow, RateLimitRecord>()
	private readonly boundaries = new Map<ProviderLimitWindow, Date>()

	observe(record: RateLimitRecord | undefined): void {
		if (!record) return
		this.verdicts.set(record.window, record)
		if (record.resetsAt) this.boundaries.set(record.window, record.resetsAt)
	}

	/** The last verdict on each window, in the shape the run's terminal record carries. */
	get limits(): ObservedProviderLimit[] {
		return [...this.verdicts.values()].map(record => ({
			window: record.window,
			status: record.status,
			...(record.resetsAt && { resetsAt: record.resetsAt }),
		}))
	}

	/**
	 * When a refused run can first be retried: the LATEST reset among the windows whose last verdict is a refusal —
	 * every refused window has to reopen. `undefined` when no window refused (a warning never pauses anything).
	 */
	get retryAfter(): Date | undefined {
		const resets = [...this.verdicts.values()]
			.filter(record => record.status === ProviderLimitStatus.REJECTED)
			.flatMap(record => (record.resetsAt ? [record.resetsAt] : []))
		return resets.length > 0 ? new Date(Math.max(...resets.map(reset => reset.getTime()))) : undefined
	}

	/** The last boundary of each window the provider named; empty ⇒ it named none. */
	get windows(): LimitWindowBoundary[] {
		return [...this.boundaries].map(([window, resetsAt]) => ({ window, resetsAt }))
	}
}
