import { AggregateRoot, BaseError, Id, z } from '@template/core-typescript'
import Z from 'zod'
import { CardCreatedEvent } from '../events/CardCreatedEvent'
import { CardMovedDomainEvent } from '../events/CardMovedDomainEvent'
import type { CardErrors } from '../errors'

export const CardSchema = z.object({
	boardId: z.uuid(),
	listId: z.uuid(),
	title: z.string().min(1),
	position: z.number().int().min(0).default(0),
	archivedAt: z.date().nullable().default(null),
})

export type CardSchemaProps = Z.infer<typeof CardSchema>

export class Card extends AggregateRoot<typeof CardSchema> {
	static override schema = CardSchema

	static create(input: { boardId: string; listId: string; title: string; storeId: string; position?: number }): Card {
		if (!input.title.trim()) throw new BaseError<CardErrors>('CARD_TITLE_EMPTY')
		const card = new Card({
			boardId: input.boardId,
			listId: input.listId,
			title: input.title.trim(),
			position: input.position ?? 0,
			archivedAt: null,
		})
		card.addDomainEvent(
			new CardCreatedEvent({
				ownerId: input.storeId,
				payload: { cardId: card.id.value, boardId: input.boardId, listId: input.listId, storeId: input.storeId },
			}),
		)
		return card
	}

	static reconstitute(props: CardSchemaProps & { id: string | Id; createdAt?: Date; updatedAt?: Date; version?: number }): Card {
		return new Card({
			id: props.id,
			boardId: props.boardId,
			listId: props.listId,
			title: props.title,
			position: props.position,
			archivedAt: props.archivedAt,
			createdAt: props.createdAt,
			updatedAt: props.updatedAt,
			version: props.version,
		})
	}

	move(toListId: string, storeId: string): void {
		const fromListId = this.listId
		this.listId = toListId
		this.addDomainEvent(
			new CardMovedDomainEvent({
				ownerId: storeId,
				payload: { cardId: this.id.value, boardId: this.boardId, fromListId, toListId, storeId },
			}),
		)
	}
}

export interface Card extends CardSchemaProps {}
