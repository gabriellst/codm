import { BaseDomainEvent, z } from '@codedm/core-typescript'

export const TaskAssignedEventSchema = z.domainEvent({
	taskId: z.uuid(),
	assigneeIds: z.array(z.uuid()),
})

export class TaskAssignedEvent extends BaseDomainEvent<typeof TaskAssignedEventSchema> {
	static override readonly name = 'task.assigned' as const
	declare readonly name: 'task.assigned'
	static readonly schema = TaskAssignedEventSchema
}
