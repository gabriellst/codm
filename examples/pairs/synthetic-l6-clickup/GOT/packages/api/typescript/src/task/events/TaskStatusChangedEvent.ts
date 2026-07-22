import { BaseDomainEvent, z } from '@codedm/core-typescript'
import { TaskStatus } from '@codedm/contracts-typescript/wire/enums'

export const TaskStatusChangedEventSchema = z.domainEvent({
	taskId: z.uuid(),
	workspaceId: z.uuid(),
	fromStatus: z.enum(TaskStatus),
	toStatus: z.enum(TaskStatus),
})

export class TaskStatusChangedEvent extends BaseDomainEvent<typeof TaskStatusChangedEventSchema> {
	static override readonly name = 'task.status_changed' as const
	declare readonly name: 'task.status_changed'
	static readonly schema = TaskStatusChangedEventSchema
}
