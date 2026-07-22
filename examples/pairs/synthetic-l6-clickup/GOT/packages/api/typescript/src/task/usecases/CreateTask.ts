import { injectable } from 'tsyringe-neo'
import { Handler, BaseError, z } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { Task } from '../entities'
import { TaskRepository } from '../repositories/TaskRepository/TaskRepository'
import { SpaceRepository } from '../../workspace/repositories/SpaceRepository/SpaceRepository'
import type { ApplicationErrors } from '../errors'
import { TaskPriority } from '@template/contracts-typescript/wire/enums'

export const CreateTaskInputSchema = z.object({
	workspaceId: z.uuid(),
	spaceId: z.uuid(),
	listId: z.uuid(),
	title: z.string().min(1),
	priority: z.enum(TaskPriority).default(TaskPriority.NORMAL),
	assigneeIds: z.array(z.uuid()).default([]),
})

export const CreateTaskOutputSchema = z.object({
	taskId: z.uuid(),
})

@injectable()
export class CreateTask extends Handler<
	typeof CreateTaskInputSchema,
	typeof CreateTaskOutputSchema
> {
	readonly name = 'create_task' as const
	readonly inputSchema = CreateTaskInputSchema
	readonly outputSchema = CreateTaskOutputSchema

	constructor(
		private taskRepository: TaskRepository,
		private spaceRepository: SpaceRepository,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const space = await this.spaceRepository.findById(input.spaceId, tx)
			if (!space) throw new BaseError<ApplicationErrors>('SPACE_NOT_FOUND')
			if (!space.hasList(input.listId)) throw new BaseError<ApplicationErrors>('LIST_NOT_IN_SPACE')

			const task = Task.create({
				workspaceId: input.workspaceId,
				spaceId: input.spaceId,
				listId: input.listId,
				title: input.title,
				priority: input.priority,
				assigneeIds: input.assigneeIds,
				position: 0,
			})
			await this.taskRepository.save(task, tx)
			for (const e of task.pullDomainEvents()) {
				await this.domainEventRepository.save(e, tx)
			}

			return { taskId: task.id.value }
		})
	}
}
