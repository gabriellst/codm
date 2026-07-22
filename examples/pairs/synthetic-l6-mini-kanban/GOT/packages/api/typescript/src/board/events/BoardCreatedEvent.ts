import { BaseDomainEvent, z } from '@codedm/core-typescript'

export const BoardCreatedEventSchema = z.domainEvent({
	boardId: z.uuid(),
	storeId: z.uuid(),
})

export class BoardCreatedEvent extends BaseDomainEvent<typeof BoardCreatedEventSchema> {
	static override readonly name = 'board.board.created' as const
	static readonly schema = BoardCreatedEventSchema
}
