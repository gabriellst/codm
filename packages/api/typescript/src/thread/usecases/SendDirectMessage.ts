import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError, CommandQueue } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { MessageAuthor, TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { ChannelConnectivity } from '../services/ChannelConnectivity'
import { DirectMessageSentEvent } from '../events'
import type { DeliverChannelMessage } from './DeliverChannelMessage'
import type { ApplicationErrors } from '../errors'

export const SendDirectMessageInputSchema = z.object({ ownerId: z.uuid(), threadId: z.uuid(), text: z.string().trim().min(1) })
export const SendDirectMessageOutputSchema = z.object({ entryId: z.uuid() })

/**
 * C20 SendDirectMessage — the operator speaks as themselves on the channel. Requires the channel
 * CONNECTED. Appends a DIRECT transcript entry, records the `thread.direct_message_sent` FACT, and
 * ORDERS the delivery as a durable command — all three in one transaction.
 *
 * The order is a COMMAND, not an event (B3, decision 2): "put this text on the channel" has exactly
 * one executor and is an instruction, not a fact anyone may react to. `enqueueCommand(..., tx)` writes
 * the row inside THIS transaction, so a crash between "the operator sees their message in the console"
 * and "the message is on WhatsApp" leaves a row the CommandQueue worker reclaims. Before B3 the same
 * intent rode `thread.direct_message_sent` → `integration.channel.delivery_requested` through
 * `ExternalMediator.publish`, which persisted NOTHING: the message was lost with no retry.
 */
@injectable()
export class SendDirectMessage extends Handler<typeof SendDirectMessageInputSchema, typeof SendDirectMessageOutputSchema> {
	readonly name = 'send_direct_message' as const
	readonly inputSchema = SendDirectMessageInputSchema
	readonly outputSchema = SendDirectMessageOutputSchema

	constructor(
		private readonly threads: ThreadRepository,
		private readonly connectivity: ChannelConnectivity,
		private readonly commands: CommandQueue,
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
			const entry = thread.recordEntry({ kind: TranscriptKind.DIRECT, text: input.text })
			await this.threads.save(thread, tx)

			// THE ORDER, in the SAME transaction as the entry it refers to — the same shape
			// `IngestChannelMessage` uses for the mailbox item. `jobId` is the ENTRY id, so a retried
			// request that already committed re-enqueues the same id and the queue's conflict makes it a
			// no-op instead of a second message in a real conversation.
			await this.commands.enqueueCommand<DeliverChannelMessage>(
				'deliver_channel_message',
				{
					ownerId: thread.ownerId,
					channelId: thread.channelId,
					contactExternalId: thread.contactRef.externalId,
					text: input.text,
					// A HUMAN wrote it. The owner typed it in the console and we are only the courier — which
					// is exactly the distinction `fromMe` cannot make once we can send.
					author: MessageAuthor.HUMAN,
				},
				{ jobId: entry.entryId },
				tx,
			)

			// The FACT stays (decision 3): it describes "the operator spoke on the channel" and is an
			// auditable record with NO consumer — the delivery no longer hangs off it.
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
