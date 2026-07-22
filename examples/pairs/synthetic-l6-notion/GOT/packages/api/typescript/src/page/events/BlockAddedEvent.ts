import { BaseDomainEvent, z } from '@template/core-typescript'
import { BlockSchema } from '../objects/Block'

export const BlockAddedEventSchema = z.domainEvent({
	pageId: z.uuid(),
	workspaceId: z.uuid(),
	blockId: z.uuid(),
	parentBlockId: z.uuid().nullable(),
	block: BlockSchema,
})

export class BlockAddedEvent extends BaseDomainEvent<typeof BlockAddedEventSchema> {
	static override readonly name = 'page.block.added' as const
	declare readonly name: typeof BlockAddedEvent.name
	static readonly schema = BlockAddedEventSchema
}
