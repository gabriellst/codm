import { BaseDomainEvent, z } from '@codedm/core-typescript'

export const CardCreatedEventSchema = z.domainEvent({
	cardId: z.uuid(),
	boardId: z.uuid(),
	listId: z.uuid(),
	storeId: z.uuid(),
})

export class CardCreatedEvent extends BaseDomainEvent<typeof CardCreatedEventSchema> {
	static override readonly name = 'card.card.created' as const
	static readonly schema = CardCreatedEventSchema
}
