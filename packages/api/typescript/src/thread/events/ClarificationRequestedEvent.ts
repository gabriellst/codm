import { BaseDomainEvent, z } from '@codedm/core-typescript'
import { ContactKind } from '@codedm/contracts-typescript/wire/enums'

/** Context-private fact: the router asked a disambiguation question (max one open per sender). The
 *  internal bridge orders the ROUTER-identity delivery via `integration.channel.delivery_requested`. */
export const ClarificationRequestedEventSchema = z.domainEvent({
	threadId: z.string(),
	entryId: z.string(),
	channelId: z.string(),
	contactExternalId: z.string(),
	contactDisplayName: z.string(),
	contactKind: z.enum(ContactKind),
	question: z.string(),
	candidateIssueIds: z.array(z.string()),
})

export class ClarificationRequestedEvent extends BaseDomainEvent<typeof ClarificationRequestedEventSchema> {
	static override readonly name = 'thread.clarification_requested' as const
	static readonly schema = ClarificationRequestedEventSchema
}
