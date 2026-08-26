import { injectable } from 'tsyringe-neo'
import { BaseError, EventHandler } from '@codm/core-typescript'
import { ThreadStopRaisedEvent } from '@codm/contracts-typescript/wire/events'
import { StopKind } from '@codm/contracts-typescript/wire/enums'
import { Id } from '@codm/core-typescript'
import { RaiseStop } from '../usecases/RaiseStop'

/**
 * The stop fact from the terminal engine → a Stop on the thread it belongs to.
 *
 * This branch used to live in `issue/handlers/MaterializeIssueFromExecution`, alongside the three ISSUE
 * facts. It moved with the aggregate (B4, spec decision 4): the consuming context is the one that owns
 * the state the fact changes, and stops are `Thread`'s children now. `MaterializeIssueFromExecution`
 * keeps `opened` / `created` / `completed`, which really are issue facts.
 *
 * `threadId` comes off the payload — the fact has always carried it (that is how thread-scoped SSE
 * consumers key off it directly) — so a stop with no `issueId` routes exactly as well as one with.
 */
@injectable()
export class RecordStopFromExecution extends EventHandler<typeof ThreadStopRaisedEvent> {
	readonly event = ThreadStopRaisedEvent

	constructor(private readonly raiseStop: RaiseStop) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		try {
			// `detail` is the agent's OWN words, additive on the frozen event since Fase 6 (§4.4 item (i)) —
			// before it existed this was hardcoded `''` and every Needs-you card rendered the generic title
			// with no body.
			//
			// HUMAN_REQUESTED is the one kind whose title is the text: it is what `AskOperator` raises, and
			// the operator needs to read the QUESTION on the card, not the generic catalog line. The other
			// four kinds leave `title` undefined — `RaiseStop` resolves the generic title from
			// `THREAD_MESSAGES.stopTitle`, with the operator's language in hand, which this handler has no
			// way to know.
			const detail = event.payload.detail
			const title = event.payload.kind === StopKind.HUMAN_REQUESTED && detail.length > 0 ? detail : undefined
			await this.raiseStop.execute({
				stopId: event.payload.stopId || Id.value(),
				threadId: event.payload.threadId,
				issueId: event.payload.issueId,
				kind: event.payload.kind,
				title,
				detail,
			})
		} catch (error) {
			// ONLY the sanctioned no-op outcomes are swallowed (the stop is simply not recorded). Anything
			// else — a DB outage included — must rethrow so the outbox retries instead of silently eating
			// the needs-you signal.
			const swallowed: readonly string[] = ['STOP_CRITERION_DISABLED', 'ISSUE_ARCHIVED', 'ISSUE_NOT_FOUND', 'THREAD_NOT_FOUND']
			if (error instanceof BaseError && swallowed.includes(error.name)) return
			throw error
		}
	}
}
