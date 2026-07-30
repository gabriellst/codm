import { injectable } from 'tsyringe-neo'
import { Handler, z, CommandQueue } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { MessageAuthor, TranscriptKind } from '@codedm/contracts-typescript/wire/enums'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { TranscriptRepository } from '../repositories/TranscriptRepository'
import { ConsumedMessageRepository } from '../repositories/ConsumedMessageRepository'
import type { DeliverChannelMessage } from './DeliverChannelMessage'

export const RecordOrchestratorReplyInputSchema = z.object({
	ownerId: z.uuid(),
	// MIRRORS THE WIRE (`integration.orchestrator.replied` types both as plain strings): a malformed id
	// must reach the same DROP the handler always took, not a VALIDATION_ERROR the outbox would retry
	// five times and dead-letter.
	threadId: z.string(),
	text: z.string().min(1),
	replyToEntryId: z.string().optional(),
})

export const RecordOrchestratorReplyOutputSchema = z.void()

/**
 * The orchestrator's reply crosses to the channel (orchestrator pivot §7.5) — and, since the pivot,
 * the ONLY path from an agent to the channel.
 *
 * ### Why a use case and not the handler's body (B3, decision 2)
 * A handler runs OUTSIDE any transaction (`DrizzleOutboxDispatcher` dispatches after committing its
 * claim), so the entry write and the delivery order were two independent operations — and the second
 * persisted nothing at all. The canonical fix in this house is "handler invokes use case": the
 * transactional body lives here with its own UnitOfWork, and `DeliverOrchestratorReply` is thin.
 *
 * ### Ordering: the entry is written BEFORE the delivery is enqueued
 * `replyEntryId` has to exist before anything can link to it, and the enqueue rides the same
 * transaction — so a crash cannot leave a delivery pointing at an entry that never committed.
 */
@injectable()
export class RecordOrchestratorReply extends Handler<
	typeof RecordOrchestratorReplyInputSchema,
	typeof RecordOrchestratorReplyOutputSchema
> {
	readonly name = 'record_orchestrator_reply' as const
	readonly inputSchema = RecordOrchestratorReplyInputSchema
	readonly outputSchema = RecordOrchestratorReplyOutputSchema

	constructor(
		private readonly threads: ThreadRepository,
		private readonly transcript: TranscriptRepository,
		private readonly consumed: ConsumedMessageRepository,
		private readonly commands: CommandQueue,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		// Defensive drop, the same posture the inbound consumer takes: a reply for a thread that no
		// longer exists has nowhere to go, and forging a destination would be worse than silence. A THROW
		// here would be retried by the outbox and, on a conversational turn, a retry is a second message.
		const thread = await this.threads.findById(input.threadId)
		if (!thread) return

		await this.withTransaction(tx, async tx => {
			const entry = await this.transcript.append(
				{
					ownerId: input.ownerId,
					threadId: thread.id.value,
					kind: TranscriptKind.SYSTEM,
					text: input.text,
					quotedEntryId: input.replyToEntryId,
				},
				tx,
			)

			// The platform id of the message being quoted. `findPlatformId` is the INVERSE lookup added in
			// F1 for exactly this: everywhere else resolves platform id → entry, and a citation needs the
			// other direction. Unresolvable degrades to no quote — an unquoted answer is worth far more
			// than a silence.
			const quotedMessageId = input.replyToEntryId ? await this.consumed.findPlatformId(input.replyToEntryId, tx) : undefined

			// THE ORDER, in this same transaction (B3, decision 2). `jobId` is the entry id: the queue
			// dedups on it, so a redelivered `integration.orchestrator.replied` that already committed does
			// not schedule a second send of the same entry.
			await this.commands.enqueueCommand<DeliverChannelMessage>(
				'deliver_channel_message',
				{
					ownerId: input.ownerId,
					channelId: thread.channelId,
					contactExternalId: thread.contactRef.externalId,
					text: input.text,
					author: MessageAuthor.SYSTEM,
					quotedMessageId,
					// Carried so the ledger row can link back to the entry this message IS.
					replyEntryId: entry.entryId,
				},
				{ jobId: entry.entryId },
				tx,
			)
		})
	}
}
