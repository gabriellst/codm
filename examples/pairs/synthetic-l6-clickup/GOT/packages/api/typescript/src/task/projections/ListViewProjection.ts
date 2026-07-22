import { z } from '@codedm/core-typescript'
import Z from 'zod'
import { TaskStatus, TaskPriority } from '@codedm/contracts-typescript/wire/enums'
import { TaskCreatedEvent } from '@task/events/TaskCreatedEvent'
import { TaskStatusChangedEvent } from '@task/events/TaskStatusChangedEvent'
import { TaskAssignedEvent } from '@task/events/TaskAssignedEvent'
import { TaskMovedEvent } from '@task/events/TaskMovedEvent'

export const ListViewProjectionSchema = z.object({
	taskId: z.uuid(),
	spaceId: z.uuid(),
	listId: z.uuid(),
	title: z.string(),
	status: z.enum(TaskStatus),
	priority: z.enum(TaskPriority),
	assigneeIds: z.array(z.uuid()),
	position: z.number().int(),
})

export type ListViewProjectionProps = Z.infer<typeof ListViewProjectionSchema>

export type ListViewProjectionEvent =
	| TaskCreatedEvent
	| TaskStatusChangedEvent
	| TaskAssignedEvent
	| TaskMovedEvent

export class ListViewProjection {
	constructor(public props: ListViewProjectionProps) {}

	static create(event: TaskCreatedEvent): ListViewProjection {
		return new ListViewProjection({
			taskId: event.payload.taskId,
			spaceId: event.payload.spaceId,
			listId: event.payload.listId,
			title: event.payload.title,
			status: event.payload.status,
			priority: event.payload.priority,
			assigneeIds: event.payload.assigneeIds,
			position: event.payload.position,
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
