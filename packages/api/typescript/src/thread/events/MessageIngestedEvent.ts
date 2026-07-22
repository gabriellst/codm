import { BaseDomainEvent, z } from '@codedm/core-typescript'

/** Context-private fact: an inbound message was appended to the buffer + transcript; `invocable`
 *  records whether the pause/permission/mention gates let it reach classification. */
export const MessageIngestedEventSchema = z.domainEvent({
	threadId: z.string(),
	entryId: z.string(),
	senderExternalId: z.string(),
	invocable: z.boolean(),
})

export class MessageIngestedEvent extends BaseDomainEvent<typeof MessageIngestedEventSchema> {
	static override readonly name = 'thread.message_ingested' as const
	static readonly schema = MessageIngestedEventSchema
}
