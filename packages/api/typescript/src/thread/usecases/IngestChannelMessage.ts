import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { MailboxItemKind, MailboxTargetKind, TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { MailboxRepository } from '@agent/repositories'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { MessageIngestedEvent } from '../events'
import type { ApplicationErrors } from '../errors'

export const IngestChannelMessageInputSchema = z.object({
	threadId: z.uuid(),
	senderExternalId: z.string(),
	text: z.string(),
	quotedEntryId: z.string().optional(),
	receivedAt: z.date(),
})

export const IngestChannelMessageOutputSchema = z.object({
	entryId: z.uuid(),
	invocable: z.boolean(),
})

/**
 * C16 IngestChannelMessage — appends the inbound to the transcript + rolling context buffer
 * UNCONDITIONALLY (even from read-only participants), then evaluates the invocation gates
 * (paused? sender may invoke? mention tag present when the gate is on?). Returns `invocable` so the
 * ingestion consumer knows whether to hand off to classification.
 */
@injectable()
export class IngestChannelMessage extends Handler<typeof IngestChannelMessageInputSchema, typeof IngestChannelMessageOutputSchema> {
	readonly name = 'ingest_channel_message' as const
	readonly inputSchema = IngestChannelMessageInputSchema
	readonly outputSchema = IngestChannelMessageOutputSchema

	constructor(
		private readonly threads: ThreadRepository,
		private readonly mailbox: MailboxRepository,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		// A deleted thread is not a thread this use case may write to (thread-deletion spec, decision 3),
		// so it answers with the code it already has for "there is nothing here to ingest into".
		//
		// This is the FLOOR, not the gate: `ConsumeInboundMessage` drops the message before ever calling
		// here, which is where the decision's "ignora, sem side-effects" actually lives. The guard exists
		// so the invariant holds for any future caller too — an ingest that silently appended to an
		// apagada conversation would put words in a chat the console answers THREAD_NOT_FOUND for.
		const thread = await this.threads.findById(input.threadId)
		if (!thread || thread.deletedAt) throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${input.threadId}`)

		return this.withTransaction(tx, async tx => {
			// THE CITATION, RESOLVED FIRST (B4, decision D-B). This lookup already existed — it is how
			// `repliesToAgent` is decided — and it now serves two purposes with one query: it tells us
			// whether the quote addresses the agent, and it is the PROOF of thread membership that
			// `recordEntry` demands. A quote that does not resolve degrades to no quote rather than being
			// written blind at a `quoted_entry_id` pointing nowhere, which is what happened before.
			const quoted = input.quotedEntryId ? await this.threads.findEntry(input.quotedEntryId, tx) : undefined

			// Is this a REPLY to something the agent itself said? `SYSTEM` is the kind
			// `RecordOrchestratorReply` writes, so it is exactly "the agent's own words", and quoting
			// those is addressing it — the mention gate stands down for that case (see `Thread.canInvoke`).
			// A quote that resolves to anyone else's message, or does not resolve at all, is not one.
			const repliesToAgent = quoted?.kind === TranscriptKind.SYSTEM

			// Always buffer + transcribe, even when the sender can't invoke (observation ≠ invocation).
			const entry = thread.recordEntry({
				kind: TranscriptKind.CONTACT,
				text: input.text,
				senderExternalId: input.senderExternalId,
				quotedEntry: quoted ? { entryId: quoted.entryId, threadId: quoted.threadId } : undefined,
				at: input.receivedAt,
			})
			await this.threads.save(thread, tx)

			const invocable = thread.canInvoke({ senderExternalId: input.senderExternalId, text: input.text, repliesToAgent })

			// THE REPOINT (orchestrator pivot §7.4). An invocable message schedules a turn of the thread's
			// orchestrator, and the item is written IN THIS TRANSACTION — the same one that created the
			// entry it refers to.
			//
			// That is what closes the window the design review named a swallow-hole: with the enqueue
			// outside, a crash between "the entry is committed" and "the turn is queued" loses the message
			// silently — the operator sees it in their own chat history and never gets an answer. Committed
			// together, either both exist or neither does.
			//
			// `dedupKey` is the ENTRY id, so a redelivered gateway event re-inserts, conflicts on the
			// unique index, and queues nothing. This use case does NOT ask whether a turn is already
			// running: producers only insert, and the dispatcher's per-target lease decides what runs (§3).
			if (invocable) {
				await this.mailbox.enqueue(
					{
						ownerId: thread.ownerId,
						targetKind: MailboxTargetKind.THREAD,
						targetId: thread.id.value,
						kind: MailboxItemKind.OPERATOR_MESSAGE,
						payload: {
							kind: MailboxItemKind.OPERATOR_MESSAGE,
							entryId: entry.entryId,
							speaker: input.senderExternalId,
							text: thread.textWithoutMention(input.text),
						},
						dedupKey: entry.entryId,
					},
					tx,
				)
			}

			await this.domainEventRepository.save(
				new MessageIngestedEvent({
					entityId: thread.id.value,
					ownerId: thread.ownerId,
					payload: { threadId: thread.id.value, entryId: entry.entryId, senderExternalId: input.senderExternalId, invocable },
				}),
				tx,
			)

			return { entryId: entry.entryId, invocable }
		})
	}
}
