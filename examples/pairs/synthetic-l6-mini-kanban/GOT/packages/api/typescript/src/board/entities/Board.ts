import { AggregateRoot, BaseError, Id, z } from '@codedm/core-typescript'
import Z from 'zod'
import { BoardList } from './BoardList'
import { BoardCreatedEvent } from '../events/BoardCreatedEvent'
import { BoardArchivedEvent } from '../events/BoardArchivedEvent'
import type { BoardErrors } from '../errors'

export const BoardSchema = z.object({
	storeId: z.uuid(),
	title: z.string().min(1),
	archivedAt: z.date().nullable().default(null),
})

export type BoardSchemaProps = Z.infer<typeof BoardSchema>

export type BoardProps = BoardSchemaProps & {
	id: Id
	lists: BoardList[]
	createdAt: Date
	updatedAt: Date
	version: number
}

export class Board extends AggregateRoot<typeof BoardSchema> {
	static override schema = BoardSchema

	// BoardList VOs are managed manually alongside base entity fields
	private _lists: BoardList[] = []

	static create(input: { storeId: string; title: string }): Board {
		if (!input.title.trim()) throw new BaseError<BoardErrors>('BOARD_TITLE_EMPTY')
		const board = new Board({
			id: new Id(),
			storeId: input.storeId,
			title: input.title.trim(),
			archivedAt: null,
		})
		board.addDomainEvent(
			new BoardCreatedEvent({
				ownerId: input.storeId,
				payload: { boardId: board.id.value, storeId: input.storeId },
			}),
		)
		return board
	}

	static reconstitute(props: Omit<BoardProps, 'id'> & { id: string | Id }): Board {
		const board = new Board({
			id: props.id,
			storeId: props.storeId,
			title: props.title,
			archivedAt: props.archivedAt,
			createdAt: props.createdAt,
			updatedAt: props.updatedAt,
			version: props.version,
		})
		board._lists = props.lists
		return board
	}

	get lists(): BoardList[] {
		return [...this._lists]
	}

	get isArchived(): boolean {
		return (this.archivedAt as Date | null) !== null
	}

	archive(): void {
		if (this.isArchived) throw new BaseError<BoardErrors>('BOARD_ALREADY_ARCHIVED')
		this.archivedAt = new Date()
		this.updatedAt = new Date()
		this.addDomainEvent(
			new BoardArchivedEvent({
				ownerId: this.storeId,
				payload: { boardId: this.id.value, storeId: this.storeId },
			}),
		)
	}

	hasListId(listId: string): boolean {
		return this._lists.some(l => l.id === listId)
	}

	addList(list: BoardList): void {
		this._lists = [...this._lists, list]
		this.updatedAt = new Date()
	}

	replaceList(updatedList: BoardList): void {
		this._lists = this._lists.map(l => (l.id === updatedList.id ? updatedList : l))
		this.updatedAt = new Date()
	}
}

export interface Board extends BoardProps {}
