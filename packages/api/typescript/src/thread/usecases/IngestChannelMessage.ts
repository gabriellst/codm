import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { TranscriptKind } from '@template/contracts-typescript/wire/enums'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { TranscriptRepository } from '../repositories/TranscriptRepository'
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
		private readonly transcript: TranscriptRepository,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const thread = await this.threads.findById(input.threadId)
		if (!thread) throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${input.threadId}`)

		return this.withTransaction(tx, async tx => {
			// Always buffer + transcribe, even when the sender can't invoke (observation ≠ invocation).
			const entry = await this.transcript.append(
				{
					ownerId: thread.ownerId,
					threadId: thread.id.value,
					kind: TranscriptKind.CONTACT,
					text: input.text,
					senderExternalId: input.senderExternalId,
					quotedEntryId: input.quotedEntryId,
					at: input.receivedAt,
				},
				tx,
			)

			const invocable = thread.canInvoke({ senderExternalId: input.senderExternalId, text: input.text })

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
