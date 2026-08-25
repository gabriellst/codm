import { injectable } from 'tsyringe-neo'
import { Handler, LoggingService, tryCatchAsync, z } from '@codm/core-typescript'
import { ChannelSender } from '../services/ChannelSender'

export const ReactToChannelMessageInputSchema = z.object({
	ownerId: z.uuid(),
	channelId: z.string(),
	remoteId: z.string(),
	/** The PLATFORM id of the message being reacted to — the wamid the inbound event carried. */
	messageId: z.string(),
	fromMe: z.boolean(),
	/**
	 * The emoji, carried rather than hardcoded. Decision 11 wants a SECOND cue on the way out (the
	 * "needs you" signal when a turn ends in a stop) and the platform replaces a sender's reaction on
	 * resend — so the same command serves both, and the swap costs an argument.
	 */
	reaction: z.string(),
})

export const ReactToChannelMessageOutputSchema = z.void()

/**
 * The `👀` cue leaving for the channel (streaming spec, decision 10).
 *
 * ### Why a command and not an inline call from the ingest
 * Same reason `deliver_channel_message` is one (B3, decision 2), plus one that is specific to a cue:
 * the ingest's transaction holds SQLite's single write lock, and an HTTP round-trip to the gateway
 * inside it would block every other writer in the process — for a decoration. As a command the cue
 * rides `shared_scheduled_commands`, enqueued in the SAME transaction as the decision that justifies
 * it, and the gateway call happens afterwards, on the queue's own time.
 *
 * ### BEST-EFFORT, and it is THIS class that decides so (decision 12)
 * A failed cue is SWALLOWED here: no throw, no retry, no dead-letter row. That is deliberate and it
 * is the whole point of the decision — "um sinal cosmético que derruba a mensagem real seria o pior
 * dos mundos", and a dead-lettered row is operator-visible, which the decision also rules out. Note
 * where the swallow is NOT: `GatewayChannelSender.react` still throws, so the port stays honest for
 * every future caller and the reason still reaches the log.
 *
 * A cue is also worthless late, which is why the swallow costs nothing: by the time three exponential
 * retries had run, the reply itself would already be on the channel and the "I saw this" would be
 * answering a question nobody is still asking.
 */
@injectable()
export class ReactToChannelMessage extends Handler<typeof ReactToChannelMessageInputSchema, typeof ReactToChannelMessageOutputSchema> {
	readonly name = 'react_to_channel_message' as const
	readonly inputSchema = ReactToChannelMessageInputSchema
	readonly outputSchema = ReactToChannelMessageOutputSchema

	constructor(
		private readonly sender: ChannelSender,
		private readonly logging: LoggingService,
	) {
		super()
	}

	protected async handle(input: this['input']): Promise<void> {
		const { ownerId, channelId, remoteId, messageId, fromMe, reaction } = input

		// EXTERNAL I/O, NO TRANSACTION AT ALL — this command touches no table. Nothing to commit,
		// nothing to roll back, and nothing that a failure here could leave half-written.
		const outcome = await tryCatchAsync(() => this.sender.react({ channelId, remoteId, messageId, fromMe, reaction }, ownerId))

		if (!outcome.success) {
			// INFO, not error: the operator has nothing to do about a missing emoji, and an ERROR line
			// would page someone for a decoration. The reason is kept because "the gateway refused every
			// cue" is a real signal when read in aggregate.
			this.logging.info({
				content: { message: 'channel reaction skipped (best-effort)', channelId, messageId, reason: outcome.error.message },
			})
			return
		}

		this.logging.debug({ content: { message: 'channel reaction sent', channelId, messageId, reaction } })
	}
}
