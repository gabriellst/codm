import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { TranscriptKind } from '@codedm/contracts-typescript/wire/enums'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { TranscriptRepository } from '../repositories/TranscriptRepository'
import { ChannelConnectivity } from '../services/ChannelConnectivity'
import { DirectMessageSentEvent } from '../events'
import type { ApplicationErrors } from '../errors'

export const SendDirectMessageInputSchema = z.object({ ownerId: z.uuid(), threadId: z.uuid(), text: z.string().trim().min(1) })
export const SendDirectMessageOutputSchema = z.object({ entryId: z.uuid() })

/**
 * C20 SendDirectMessage — the operator speaks as themselves on the channel. Requires the thread to be
 * PAUSED (`THREAD_NOT_PAUSED`) and the channel CONNECTED. Appends a DIRECT transcript entry
 * and orders the delivery via `thread.direct_message_sent` → `integration.channel.delivery_requested`.
 */
@injectable()
export class SendDirectMessage extends Handler<typeof SendDirectMessageInputSchema, typeof SendDirectMessageOutputSchema> {
	readonly name = 'send_direct_message' as const
	readonly inputSchema = SendDirectMessageInputSchema
	readonly outputSchema = SendDirectMessageOutputSchema

	constructor(
		private readonly threads: ThreadRepository,
		private readonly transcript: TranscriptRepository,
		private readonly connectivity: ChannelConnectivity,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const thread = await this.threads.findById(input.threadId)
		if (!thread || thread.ownerId !== input.ownerId)
			throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${input.threadId}`)
		if (!(await this.connectivity.isConnected(thread.channelId))) {
			throw new BaseError<ApplicationErrors>('CHANNEL_NOT_CONNECTED', 'the channel is not connected')
		}

		return this.withTransaction(tx, async tx => {
			const entry = await this.transcript.append(
				{ ownerId: thread.ownerId, threadId: thread.id.value, kind: TranscriptKind.DIRECT, text: input.text },
				tx,
			)
			await this.domainEventRepository.save(
				new DirectMessageSentEvent({
					entityId: thread.id.value,
					ownerId: thread.ownerId,
					payload: {
						threadId: thread.id.value,
						entryId: entry.entryId,
						channelId: thread.channelId,
						contactExternalId: thread.contactRef.externalId,
						contactDisplayName: thread.contactRef.displayName,
						contactKind: thread.contactRef.kind,
						text: input.text,
					},
				}),
				tx,
			)
			return { entryId: entry.entryId }
		})
	}
}
