import { injectable } from 'tsyringe-neo'
import { BaseError, EventHandler, LoggingService } from '@codm/core-typescript'
import { ThreadIssueSignalEvent } from '@codm/contracts-typescript/wire/events'
import { IssueSignalLevel } from '@codm/contracts-typescript/wire/enums'
import { DeliverIssueSignal } from '../usecases/DeliverIssueSignal'

/**
 * Which levels an issue may SAY through `integration.thread.issue_signal` (fase 3) — total over
 * `IssueSignalLevel`. The wire carries the whole enum (the codegen has no subset of an enum), so the subset
 * is declared here: a decision and a question are stops (they travel with an ask on `stop_raised`), the
 * closing comes from `integration.issue.completed`, a block notice from the thread's own stops.
 */
export const SPOKEN_BY_AN_ISSUE: Record<IssueSignalLevel, boolean> = {
	[IssueSignalLevel.FEEDBACK]: true,
	[IssueSignalLevel.PROGRESS]: true,
	[IssueSignalLevel.DECISION]: false,
	[IssueSignalLevel.QUESTION]: false,
	[IssueSignalLevel.CLOSING]: false,
	[IssueSignalLevel.BLOCK_NOTICE]: false,
}

/**
 * What an issue said (a preview, its progress) → the group's output policy (`DeliverIssueSignal`), which
 * decides where it goes. A level an issue does not say this way is refused — logged and dropped, never
 * retried: a retry cannot make it valid.
 */
@injectable()
export class RouteIssueSignal extends EventHandler<typeof ThreadIssueSignalEvent> {
	readonly event = ThreadIssueSignalEvent

	constructor(
		private readonly deliver: DeliverIssueSignal,
		private readonly logging: LoggingService,
	) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const { payload } = event
		if (!SPOKEN_BY_AN_ISSUE[payload.level]) {
			this.logging.warn({
				content: { message: 'issue signal refused — not a level an issue says', level: payload.level, issueId: payload.issueId },
			})
			return
		}
		try {
			await this.deliver.execute({
				threadId: payload.threadId,
				issueId: payload.issueId,
				level: payload.level,
				text: payload.text,
				addresseeId: payload.addresseeId,
				mainArtifactId: payload.mainArtifactId,
				artifactIds: payload.artifactIds,
			})
		} catch (error) {
			// The conversation or the issue is gone — nowhere to say it; a retry would find them gone too.
			const gone: readonly string[] = ['THREAD_NOT_FOUND', 'ISSUE_NOT_FOUND']
			if (error instanceof BaseError && gone.includes(error.name)) {
				this.logging.warn({ content: { message: 'issue signal dropped', reason: error.name, issueId: payload.issueId } })
				return
			}
			throw error
		}
	}
}
