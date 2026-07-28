import { injectable } from 'tsyringe-neo'
import { EventHandler, ExternalMediator } from '@codedm/core-typescript'
import { AgentReplyDraftedEvent, ChannelDeliveryRequestedEvent } from '@codedm/contracts-typescript/wire/events'
import { MessageAuthor } from '@codedm/contracts-typescript/wire/enums'
import { ThreadRepository } from '../repositories/ThreadRepository'

/**
 * The missing link between "the agent produced an answer" and "the answer left the machine".
 *
 * `integration.agent.reply_drafted` was published on every completed turn and consumed by nobody, so
 * a correct, finished answer sat in the outbox and on the SSE surface while the conversation it
 * belonged to stayed silent. This handler turns it into the delivery request the channel already
 * knows how to satisfy.
 *
 * ### Why the translation is not just a rename
 * The agent context speaks in ISSUES; the channel speaks in CONVERSATIONS. Only the thread knows
 * which contact an issue belongs to, which is why this bridge lives HERE and not beside the agent's
 * own publisher — the agent has no business holding a channel id or a contact JID.
 *
 * `author: SYSTEM` is the product speaking, which is what lets the delivery leg claim the outgoing
 * message id and keep the echo of our own reply from being heard as speech.
 *
 * NOT YET QUOTED. The reply should cite the message that opened the issue: it makes the answer
 * legible in a busy group AND it feeds our own inbound shortcut, since a human replying to a quoted
 * message routes straight back to that issue with no model call. The lookup is available — the
 * consumed ledger maps a transcript entry to its platform id — and is deliberately a separate step
 * from making delivery work at all.
 */
@injectable()
export class RequestAgentReplyDelivery extends EventHandler<typeof AgentReplyDraftedEvent> {
	readonly event = AgentReplyDraftedEvent

	constructor(
		private readonly threads: ThreadRepository,
		private readonly mediator: ExternalMediator,
	) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const ownerId = event.ownerId
		if (!ownerId) return

		// Defensive drop, the same posture the inbound consumer takes: a reply for a thread that no
		// longer exists has nowhere to go, and forging a destination would be worse than silence.
		const thread = await this.threads.findById(event.payload.threadId)
		if (!thread) return

		await this.mediator.publish(
			new ChannelDeliveryRequestedEvent({
				ownerId,
				payload: {
					channelId: thread.channelId,
					contactExternalId: thread.contactRef.externalId,
					contactDisplayName: thread.contactRef.displayName,
					contactKind: thread.contactRef.kind,
					text: event.payload.text,
					labelIssueKey: event.payload.labelIssueKey,
					labelThreadId: event.payload.labelThreadId,
					author: MessageAuthor.SYSTEM,
				},
			}),
		)
	}
}
