import { BaseDomainEvent, z } from '@template/core-typescript'

export const BoardArchivedEventSchema = z.domainEvent({
	boardId: z.uuid(),
	storeId: z.uuid(),
})

export class BoardArchivedEvent extends BaseDomainEvent<typeof BoardArchivedEventSchema> {
	static override readonly name = 'board.board.archived' as const
	static readonly schema = BoardArchivedEventSchema
}
