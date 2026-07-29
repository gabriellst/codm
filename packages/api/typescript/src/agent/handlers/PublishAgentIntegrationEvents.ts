import { injectable } from 'tsyringe-neo'
import { EventHandler, ExternalMediator } from '@codedm/core-typescript'
import {
	IssueOpenedEvent,
	IssueCreatedEvent,
	IssueCompletedEvent,
	IssueStopRaisedEvent,
	AgentReplyDraftedEvent as AgentReplyDraftedIntegrationEvent,
} from '@codedm/contracts-typescript/wire/events'
import { AgentRunStartedEvent } from '../events/AgentRunStartedEvent'
import { IssueForkedEvent } from '../events/IssueForkedEvent'
import { AgentRunReplyDraftedEvent } from '../events/AgentRunReplyDraftedEvent'
import { AgentRunCompletedEvent } from '../events/AgentRunCompletedEvent'
import { AgentRunStopRaisedEvent } from '../events/AgentRunStopRaisedEvent'

/**
 * The write-side bridge: the terminal runtime raises context-PRIVATE `terminal.*` domain facts (so
 * they fan out in-process via the outbox → InternalMediator), and THIS handler republishes each as
 * its FROZEN cross-context integration event on the ExternalMediator. This is the canonical
 * "integration events are published by handlers, never use cases" seam (EVT-02/EVT-03): the events
 * are BORN in `packages/contracts` and only mapped here — nothing new is authored api-side.
 *
 * One multi-event handler, one 1:1 map:
 *   agent.run.started    → integration.issue.opened        (BC5 → BC4, triggers transcript/status)
 *   agent.run.reply_drafted→ integration.agent.reply_drafted (BC5 → BC4 → BC1, labeled delivery)
 *   agent.run.completed  → integration.issue.completed     (BC5 → BC4, starts the 24h clock)
 *   agent.run.stop_raised        → integration.issue.stop_raised   (BC5 → BC4, NEEDS_ATTENTION)
 */
@injectable()
export class PublishAgentIntegrationEvents extends EventHandler<
	readonly [
		typeof AgentRunStartedEvent,
		typeof IssueForkedEvent,
		typeof AgentRunReplyDraftedEvent,
		typeof AgentRunCompletedEvent,
		typeof AgentRunStopRaisedEvent,
	]
> {
	readonly event = [
		AgentRunStartedEvent,
		IssueForkedEvent,
		AgentRunReplyDraftedEvent,
		AgentRunCompletedEvent,
		AgentRunStopRaisedEvent,
	] as const

	constructor(private readonly mediator: ExternalMediator) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const ownerId = event.ownerId ?? ''

		// `instanceof` narrows the union instance to the concrete event (typed payload) without
		// relying on a string discriminant — one branch per frozen mapping.
		if (event instanceof AgentRunStartedEvent) {
			await this.mediator.publish(
				new IssueOpenedEvent({
					ownerId,
					payload: {
						issueId: event.payload.issueId,
						threadId: event.payload.threadId,
						key: event.payload.key,
						title: event.payload.title,
						provider: event.payload.provider,
					},
				}),
			)
			return
		}

		// THE FORK (§7.2). Deliberately NOT mapped to `issue.opened`: that fact means "a worker's first
		// turn is spawning" and `RunIssueTurn` still raises it. This is the BIRTH — a different moment,
		// and the distinction D1 exists to keep (an issue is a declared fork, not a side effect of
		// something running).
		if (event instanceof IssueForkedEvent) {
			await this.mediator.publish(
				new IssueCreatedEvent({
					ownerId,
					payload: {
						issueId: event.payload.issueId,
						threadId: event.payload.threadId,
						key: event.payload.key,
						title: event.payload.title,
						goal: event.payload.goal,
						originEntryId: event.payload.originEntryId,
						provider: event.payload.provider,
					},
				}),
			)
			return
		}

		if (event instanceof AgentRunReplyDraftedEvent) {
			await this.mediator.publish(
				new AgentReplyDraftedIntegrationEvent({
					ownerId,
					payload: {
						issueId: event.payload.issueId,
						threadId: event.payload.threadId,
						labelIssueKey: event.payload.key,
						labelThreadId: event.payload.threadId,
						text: event.payload.text,
					},
				}),
			)
			return
		}

		if (event instanceof AgentRunCompletedEvent) {
			await this.mediator.publish(
				new IssueCompletedEvent({
					ownerId,
					payload: {
						issueId: event.payload.issueId,
						threadId: event.payload.threadId,
						key: event.payload.key,
						completedAt: event.payload.completedAt,
					},
				}),
			)
			return
		}

		if (event instanceof AgentRunStopRaisedEvent) {
			await this.mediator.publish(
				new IssueStopRaisedEvent({
					ownerId,
					payload: {
						stopId: event.payload.stopId,
						issueId: event.payload.issueId,
						threadId: event.payload.threadId,
						kind: event.payload.kind,
						// ADDITIVE in Fase 6 (§4.4 item (i)): without it the agent's own words die here and
						// the Needs-you card is born empty. `source` deliberately does NOT cross — it records
						// HOW we learned the fact, which is a context-private observation, and forwarding it
						// would turn a zero-cost domain field into a contract change (§4.3 rule 6).
						detail: event.payload.detail,
					},
				}),
			)
		}
	}
}
