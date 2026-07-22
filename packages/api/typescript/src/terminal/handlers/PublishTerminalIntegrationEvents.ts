import { injectable } from 'tsyringe-neo'
import { EventHandler, ExternalMediator } from '@template/core-typescript'
import {
	IssueOpenedEvent,
	IssueCompletedEvent,
	IssueStopRaisedEvent,
	AgentReplyDraftedEvent as AgentReplyDraftedIntegrationEvent,
} from '@template/contracts-typescript/wire/events'
import { TerminalSessionStartedEvent } from '../events/TerminalSessionStartedEvent'
import { TerminalReplyDraftedEvent } from '../events/TerminalReplyDraftedEvent'
import { TerminalSessionCompletedEvent } from '../events/TerminalSessionCompletedEvent'
import { TerminalStopRaisedEvent } from '../events/TerminalStopRaisedEvent'

/**
 * The write-side bridge: the terminal runtime raises context-PRIVATE `terminal.*` domain facts (so
 * they fan out in-process via the outbox → InternalMediator), and THIS handler republishes each as
 * its FROZEN cross-context integration event on the ExternalMediator. This is the canonical
 * "integration events are published by handlers, never use cases" seam (EVT-02/EVT-03): the events
 * are BORN in `packages/contracts` and only mapped here — nothing new is authored api-side.
 *
 * One multi-event handler, one 1:1 map:
 *   terminal.session.started    → integration.issue.opened        (BC5 → BC4, triggers transcript/status)
 *   terminal.agent.reply_drafted→ integration.agent.reply_drafted (BC5 → BC4 → BC1, labeled delivery)
 *   terminal.session.completed  → integration.issue.completed     (BC5 → BC4, starts the 24h clock)
 *   terminal.stop.raised        → integration.issue.stop_raised   (BC5 → BC4, NEEDS_ATTENTION)
 */
@injectable()
export class PublishTerminalIntegrationEvents extends EventHandler<
	readonly [typeof TerminalSessionStartedEvent, typeof TerminalReplyDraftedEvent, typeof TerminalSessionCompletedEvent, typeof TerminalStopRaisedEvent]
> {
	readonly event = [TerminalSessionStartedEvent, TerminalReplyDraftedEvent, TerminalSessionCompletedEvent, TerminalStopRaisedEvent] as const

	constructor(private readonly mediator: ExternalMediator) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const ownerId = event.ownerId ?? ''

		// `instanceof` narrows the union instance to the concrete event (typed payload) without
		// relying on a string discriminant — one branch per frozen mapping.
		if (event instanceof TerminalSessionStartedEvent) {
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

		if (event instanceof TerminalReplyDraftedEvent) {
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

		if (event instanceof TerminalSessionCompletedEvent) {
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

		if (event instanceof TerminalStopRaisedEvent) {
			await this.mediator.publish(
				new IssueStopRaisedEvent({
					ownerId,
					payload: {
						stopId: event.payload.stopId,
						issueId: event.payload.issueId,
						threadId: event.payload.threadId,
						kind: event.payload.kind,
					},
				}),
			)
		}
	}
}
