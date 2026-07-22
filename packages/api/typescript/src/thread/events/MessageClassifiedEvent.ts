import { BaseDomainEvent, z } from '@codedm/core-typescript'
import { ClassificationMethod } from '@codedm/contracts-typescript/wire/enums'

/** Context-private fact: an inbound message was demultiplexed into an issue (or fell through to a
 *  clarification). Bridged to the frozen `integration.message.classified` (BC4 → BC5 routes it). */
export const MessageClassifiedEventSchema = z.domainEvent({
	threadId: z.string(),
	entryId: z.string(),
	method: z.enum(ClassificationMethod),
	issueId: z.string().optional(),
})

export class MessageClassifiedEvent extends BaseDomainEvent<typeof MessageClassifiedEventSchema> {
	static override readonly name = 'thread.message_classified' as const
	static readonly schema = MessageClassifiedEventSchema
}
