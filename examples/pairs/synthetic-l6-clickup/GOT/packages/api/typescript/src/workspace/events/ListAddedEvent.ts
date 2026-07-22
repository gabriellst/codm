import { BaseDomainEvent, z } from '@template/core-typescript'

export const ListAddedEventSchema = z.domainEvent({
	listId: z.uuid(),
	spaceId: z.uuid(),
	name: z.string(),
	position: z.number().int(),
})

export class ListAddedEvent extends BaseDomainEvent<typeof ListAddedEventSchema> {
	static override readonly name = 'workspace.list_added' as const
	static readonly schema = ListAddedEventSchema
}
