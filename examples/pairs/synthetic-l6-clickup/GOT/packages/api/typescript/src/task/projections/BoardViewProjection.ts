import { z } from '@codedm/core-typescript'
import Z from 'zod'
import { TaskStatus, TaskPriority } from '@codedm/contracts-typescript/wire/enums'
import { TaskCreatedEvent } from '@task/events/TaskCreatedEvent'
import { TaskStatusChangedEvent } from '@task/events/TaskStatusChangedEvent'
import { TaskAssignedEvent } from '@task/events/TaskAssignedEvent'
import { TaskMovedEvent } from '@task/events/TaskMovedEvent'

export const BoardViewProjectionSchema = z.object({
	taskId: z.uuid(),
	spaceId: z.uuid(),
	status: z.enum(TaskStatus),
	listId: z.uuid(),
	title: z.string(),
	priority: z.enum(TaskPriority),
	assigneeIds: z.array(z.uuid()),
})

export type BoardViewProjectionProps = Z.infer<typeof BoardViewProjectionSchema>

export type BoardViewProjectionEvent =
	| TaskCreatedEvent
	| TaskStatusChangedEvent
	| TaskAssignedEvent
	| TaskMovedEvent

export class BoardViewProjection {
	constructor(public props: BoardViewProjectionProps) {}

	static create(event: TaskCreatedEvent): BoardViewProjection {
		return new BoardViewProjection({
			taskId: event.payload.taskId,
			spaceId: event.payload.spaceId,
			status: event.payload.status,
			listId: event.payload.listId,
			title: event.payload.title,
			priority: event.payload.priority,
			assigneeIds: event.payload.assigneeIds,
		})
	}

	applyEvent(event: TaskStatusChangedEvent | TaskAssignedEvent | TaskMovedEvent): void {
		switch (event.name) {
			case 'task.status_changed': this.props.status = event.payload.toStatus; return
			case 'task.assigned': this.props.assigneeIds = event.payload.assigneeIds; return
			case 'task.moved': this.props.listId = event.payload.toListId; return
			default: { const _exhaustive: never = event; return _exhaustive }
		}
	}
}
