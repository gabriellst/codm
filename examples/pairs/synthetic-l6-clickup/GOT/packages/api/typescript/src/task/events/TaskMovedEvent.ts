import { BaseDomainEvent, z } from '@codedm/core-typescript'

export const TaskMovedEventSchema = z.domainEvent({
	taskId: z.uuid(),
	spaceId: z.uuid(),
	fromListId: z.uuid(),
	toListId: z.uuid(),
})

export class TaskMovedEvent extends BaseDomainEvent<typeof TaskMovedEventSchema> {
	static override readonly name = 'task.moved' as const
	declare readonly name: 'task.moved'
	static readonly schema = TaskMovedEventSchema
}
