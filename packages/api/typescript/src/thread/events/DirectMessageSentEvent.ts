import { BaseDomainEvent, z } from '@codedm/core-typescript'
import { ContactKind } from '@codedm/contracts-typescript/wire/enums'

/** Context-private fact: the operator spoke directly on the channel. An AUDIT RECORD with NO consumer
 *  (B3, decision 3) — the delivery is a durable `deliver_channel_message` command enqueued by
 *  `SendDirectMessage` in the same transaction, not something a handler derives from this fact. */
export const DirectMessageSentEventSchema = z.domainEvent({
	threadId: z.string(),
	entryId: z.string(),
	channelId: z.string(),
	contactExternalId: z.string(),
	contactDisplayName: z.string(),
	contactKind: z.enum(ContactKind),
	text: z.string(),
})

export class DirectMessageSentEvent extends BaseDomainEvent<typeof DirectMessageSentEventSchema> {
	static override readonly name = 'thread.direct_message_sent' as const
	static readonly schema = DirectMessageSentEventSchema
}
