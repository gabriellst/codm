import { injectable } from 'tsyringe-neo'
import { Handler, z, CommandQueue } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { MessageAuthor, TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { ThreadRepository } from '../repositories/ThreadRepository'
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
 * A handler runs OUTSIDE any transaction (`LibSqlOutboxDispatcher` dispatches after committing its
 * claim), so the entry write and the delivery order were two independent operations — and the second
 * persisted nothing at all. The canonical fix in this house is "handler invokes use case": the
 * transactional body lives here with its own UnitOfWork, and `DeliverOrchestratorReply` is thin.
 *
 * ### Ordering: the entry is recorded BY THE AGGREGATE before the delivery is enqueued
 * `thread.recordEntry` mints the id synchronously and `ThreadRepository.save` persists the entry in
 * THIS transaction (B4, decision 1) — so `replyEntryId` exists before anything links to it, and the
 * enqueue rides the same transaction, meaning a crash cannot leave a delivery pointing at an entry that
 * never committed.
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
			// The citation, RESOLVED (B4, decision D-B). `replyToEntryId` mirrors the wire and is a plain
			// string, so it may well name nothing — and an unresolvable one now degrades to NO citation
			// instead of being written blind. That is the same posture the `quotedMessageId` lookup below
			// already takes, for the same reason: an unquoted answer is worth far more than a silence.
			const quoted = input.replyToEntryId ? await this.threads.findEntry(input.replyToEntryId, tx) : undefined

			const entry = thread.recordEntry({
				kind: TranscriptKind.SYSTEM,
				text: input.text,
				quotedEntry: quoted ? { entryId: quoted.entryId, threadId: quoted.threadId } : undefined,
			})
			await this.threads.save(thread, tx)

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
					// Carried so the ledger row can link back to the entry this message IS — the binding that
					// makes a human's reply to this message resolve to this entry, and so summon the agent
					// without a citation tag. The delivery leg is the only layer that can write it: the
					// platform id it keys on does not exist until the send returns.
					//
					// The THREAD comes along because `linkEntry` names both columns and this is where the
					// aggregate is in hand — deriving it down there from (channel, contact) would be a second
					// read that can disagree with the entry we just recorded.
					replyEntryId: entry.entryId,
					replyThreadId: thread.id.value,
					// PASSED THROUGH, not looked up inside `DeliverChannelMessage` (reactions/streaming spec):
					// this producer already holds the aggregate at this call site, so handing the value across
					// costs nothing, versus an extra `ThreadRepository.findById` on the hot delivery path for a
					// command that carries no thread id of its own.
					reactionsEnabled: thread.reactionsEnabled,
				},
				{ jobId: entry.entryId },
				tx,
			)
		})
	}
}
