import { BaseDomainEvent, z } from '@codedm/core-typescript'
import { TaskStatus, TaskPriority } from '@codedm/contracts-typescript/wire/enums'

export const TaskCreatedEventSchema = z.domainEvent({
	taskId: z.uuid(),
	workspaceId: z.uuid(),
	spaceId: z.uuid(),
	listId: z.uuid(),
	title: z.string(),
	status: z.enum(TaskStatus),
	priority: z.enum(TaskPriority),
	assigneeIds: z.array(z.uuid()),
	position: z.number().int(),
})

export class TaskCreatedEvent extends BaseDomainEvent<typeof TaskCreatedEventSchema> {
	static override readonly name = 'task.created' as const
	declare readonly name: 'task.created'
	static readonly schema = TaskCreatedEventSchema
}
