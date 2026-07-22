import { AggregateRoot, BaseError, z } from '@codedm/core-typescript'
import Z from 'zod'
import { TaskStatus, TaskPriority } from '@codedm/contracts-typescript/wire/enums'
import { TaskCreatedEvent, TaskStatusChangedEvent, TaskAssignedEvent, TaskMovedEvent } from '../events'
import type { DomainErrors } from '../errors'

export const TaskSchema = z.object({
	workspaceId: z.uuid(),
	spaceId: z.uuid(),
	listId: z.uuid(),
	title: z.string().min(1),
	status: z.enum(TaskStatus),
	priority: z.enum(TaskPriority),
	assigneeIds: z.array(z.uuid()).default([]),
	position: z.number().int().min(0).default(0),
})

export type TaskProps = Z.infer<typeof TaskSchema>

export class Task extends AggregateRoot<typeof TaskSchema> {
	static override schema = TaskSchema

	static create({
		workspaceId,
		spaceId,
		listId,
		title,
		priority,
		assigneeIds,
		position,
	}: {
		workspaceId: string
		spaceId: string
		listId: string
		title: string
		priority: TaskPriority
		assigneeIds?: string[]
		position?: number
	}): Task {
		const task = new Task({
			workspaceId,
			spaceId,
			listId,
			title,
			status: TaskStatus.TODO,
			priority,
			assigneeIds: assigneeIds ?? [],
			position: position ?? 0,
		})
		task.addDomainEvent(
			new TaskCreatedEvent({
				entityId: task.id.value,
				ownerId: workspaceId,
				payload: {
					taskId: task.id.value,
					workspaceId,
					spaceId,
					listId,
					title,
					status: TaskStatus.TODO,
					priority,
					assigneeIds: assigneeIds ?? [],
					position: position ?? 0,
				},
			}),
		)
		return task
	}

	changeStatus(toStatus: TaskStatus): void {
		if (toStatus === this.status) {
			throw new BaseError<DomainErrors>('TASK_STATUS_UNCHANGED')
		}
		const fromStatus = this.status
		this.status = toStatus
		this.addDomainEvent(
			new TaskStatusChangedEvent({
				entityId: this.id.value,
				ownerId: this.workspaceId,
				payload: {
					taskId: this.id.value,
					workspaceId: this.workspaceId,
					fromStatus,
					toStatus,
				},
			}),
		)
	}

	assign(assigneeIds: string[]): void {
		this.assigneeIds = assigneeIds
		this.addDomainEvent(
			new TaskAssignedEvent({
				entityId: this.id.value,
				ownerId: this.workspaceId,
				payload: {
					taskId: this.id.value,
					assigneeIds,
				},
			}),
		)
	}

	moveToList(toListId: string): void {
		const fromListId = this.listId
		this.listId = toListId
		this.addDomainEvent(
			new TaskMovedEvent({
				entityId: this.id.value,
				ownerId: this.workspaceId,
				payload: {
					taskId: this.id.value,
					spaceId: this.spaceId,
					fromListId,
					toListId,
				},
			}),
		)
	}
}

export interface Task extends TaskProps {}
