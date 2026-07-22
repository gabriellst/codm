import { BaseDomainEvent, z } from '@template/core-typescript'

/** Context-private fact: the operator spoke directly on the channel (only while paused). The
 *  internal bridge orders the OPERATOR-identity delivery via `integration.channel.delivery_requested`. */
export const DirectMessageSentEventSchema = z.domainEvent({
	threadId: z.string(),
	entryId: z.string(),
	channelId: z.string(),
	contactExternalId: z.string(),
	contactDisplayName: z.string(),
	contactKind: z.string(),
	text: z.string(),
})

export class DirectMessageSentEvent extends BaseDomainEvent<typeof DirectMessageSentEventSchema> {
	static override readonly name = 'thread.direct_message_sent' as const
	static readonly schema = DirectMessageSentEventSchema
}
