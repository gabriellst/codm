import { BaseDomainEvent, z } from '@codedm/core-typescript'

export const CardMovedDomainEventSchema = z.domainEvent({
	cardId: z.uuid(),
	boardId: z.uuid(),
	fromListId: z.uuid(),
	toListId: z.uuid(),
	storeId: z.uuid(),
})

export class CardMovedDomainEvent extends BaseDomainEvent<typeof CardMovedDomainEventSchema> {
	static override readonly name = 'card.card.moved' as const
	static readonly schema = CardMovedDomainEventSchema
}
