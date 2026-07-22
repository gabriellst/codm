import { BaseDomainEvent, z } from '@template/core-typescript'
import { ContactKind, ProviderKind } from '@template/contracts-typescript/wire/enums'

/** Context-private fact: a conversation was bound to a workspace + providers. The internal bridge
 *  maps it to the frozen `integration.thread.attached` (BC4 → BC5 warms workspace indexing). */
export const ThreadAttachedEventSchema = z.domainEvent({
	threadId: z.string(),
	channelId: z.string(),
	contactExternalId: z.string(),
	contactDisplayName: z.string(),
	contactKind: z.enum(ContactKind),
	workspaceId: z.string(),
	providers: z.array(z.enum(ProviderKind)),
})

export class ThreadAttachedEvent extends BaseDomainEvent<typeof ThreadAttachedEventSchema> {
	static override readonly name = 'thread.attached' as const
	static readonly schema = ThreadAttachedEventSchema
}
