import { Id, z } from '@template/core-typescript'
import Z from 'zod'

export const BoardListSchema = z.object({
	id: z.uuid(),
	boardId: z.uuid(),
	title: z.string().min(1),
	position: z.number().int().min(0),
})

export type BoardListProps = Z.infer<typeof BoardListSchema>

/**
 * BoardList is a VALUE OBJECT owned by the Board aggregate.
 * It has no AggregateRoot base class — it's a plain class with validated props.
 */
export class BoardList {
	private constructor(readonly props: BoardListProps) {}

	static create(props: Omit<BoardListProps, 'id'> & { id?: string }): BoardList {
		return new BoardList(BoardListSchema.parse({ id: props.id ?? new Id().value, ...props }))
	}

	static reconstitute(props: BoardListProps): BoardList {
		return new BoardList(props)
	}

	get id(): string {
		return this.props.id
	}

	get boardId(): string {
		return this.props.boardId
	}

	get title(): string {
		return this.props.title
	}

	get position(): number {
		return this.props.position
	}

	withPosition(position: number): BoardList {
		return new BoardList({ ...this.props, position })
	}
}
