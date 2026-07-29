import { injectable } from 'tsyringe-neo'
import { EventHandler, ExternalMediator } from '@codedm/core-typescript'
import { ChannelDeliveryRequestedEvent, OrchestratorRepliedEvent } from '@codedm/contracts-typescript/wire/events'
import { MessageAuthor, TranscriptKind } from '@codedm/contracts-typescript/wire/enums'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { TranscriptRepository } from '../repositories/TranscriptRepository'
import { ConsumedMessageRepository } from '../repositories/ConsumedMessageRepository'

/**
 * The orchestrator's reply crosses to the channel (orchestrator pivot §7.5) — and, since B3, the ONLY
 * path from an agent to the channel. The old handler that delivered the worker's raw draft is gone:
 * with composition live, keeping it would have put the unedited voice on the wire in a race with the
 * composed answer, i.e. two messages per conclusion.
 *
 * It does three things that handler does not, and each closes a gap the design review found:
 *
 *  1. **Writes the SYSTEM transcript entry** — and is the first producer of that kind in this
 *     context. Without it the agent's own words are absent from the very buffer its next turn reads,
 *     so a conversation would look, to the orchestrator, like a series of unanswered operator
 *     messages.
 *  2. **Resolves the quote** — `findPlatformId(replyToEntryId)` turns our entry id into the platform
 *     message id `waE2E.ContextInfo` needs. Absent when the orchestrator chose not to cite (D6), and
 *     absent-but-requested degrades to no quote rather than failing the delivery: an unquoted answer
 *     is worth far more than a silence.
 *  3. **Carries `replyEntryId` onward** so `DeliverChannelMessage` can claim WITH `linkEntry`. That is
 *     what lets a human's reply TO this message resolve back to an entry — without it the ledger row
 *     has no entryId and the reply-to-a-quoted-answer flow (§8, flow 3) never resolves.
 *
 * ### Ordering: the entry is written BEFORE the delivery is requested
 * `replyEntryId` has to exist before anything can link to it, and a delivery that raced ahead of its
 * own transcript row would produce exactly the danging ledger this exists to prevent.
 */
@injectable()
export class DeliverOrchestratorReply extends EventHandler<typeof OrchestratorRepliedEvent> {
	readonly event = OrchestratorRepliedEvent

	constructor(
		private readonly threads: ThreadRepository,
		private readonly transcript: TranscriptRepository,
		private readonly consumed: ConsumedMessageRepository,
		private readonly mediator: ExternalMediator,
	) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const ownerId = event.ownerId
		if (!ownerId) return

		// Defensive drop, the same posture the inbound consumer takes: a
		// reply for a thread that no longer exists has nowhere to go, and forging a destination would be
		// worse than silence.
		const thread = await this.threads.findById(event.payload.threadId)
		if (!thread) return

		const entry = await this.transcript.append({
			ownerId,
			threadId: event.payload.threadId,
			kind: TranscriptKind.SYSTEM,
			text: event.payload.text,
			quotedEntryId: event.payload.replyToEntryId,
		})

		// The platform id of the message being quoted. `findPlatformId` is the INVERSE lookup added in
		// F1 for exactly this: everywhere else resolves platform id → entry, and a citation needs the
		// other direction.
		const quotedMessageId = event.payload.replyToEntryId ? await this.consumed.findPlatformId(event.payload.replyToEntryId) : undefined

		await this.mediator.publish(
			new ChannelDeliveryRequestedEvent({
				ownerId,
				payload: {
					channelId: thread.channelId,
					contactExternalId: thread.contactRef.externalId,
					contactDisplayName: thread.contactRef.displayName,
					contactKind: thread.contactRef.kind,
					text: event.payload.text,
					author: MessageAuthor.SYSTEM,
					quotedMessageId,
					replyEntryId: entry.entryId,
				},
			}),
		)
	}
}
