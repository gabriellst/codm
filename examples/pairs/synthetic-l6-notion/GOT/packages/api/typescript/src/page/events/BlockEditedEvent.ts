import { BaseDomainEvent, z } from '@codedm/core-typescript'

export const BlockEditedEventSchema = z.domainEvent({
	pageId: z.uuid(),
	workspaceId: z.uuid(),
	blockId: z.uuid(),
	content: z.string(),
})

export class BlockEditedEvent extends BaseDomainEvent<typeof BlockEditedEventSchema> {
	static override readonly name = 'page.block.edited' as const
	declare readonly name: typeof BlockEditedEvent.name
	static readonly schema = BlockEditedEventSchema
}
