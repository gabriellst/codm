import { injectable } from 'tsyringe-neo'
import { Handler, BaseError, z } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { TaskRepository } from '../repositories/TaskRepository/TaskRepository'
import { SpaceRepository } from '../../workspace/repositories/SpaceRepository/SpaceRepository'
import type { ApplicationErrors } from '../errors'

export const MoveTaskInputSchema = z.object({
	taskId: z.uuid(),
	listId: z.uuid(),
})

export const MoveTaskOutputSchema = z.object({
	taskId: z.uuid(),
})

@injectable()
export class MoveTask extends Handler<typeof MoveTaskInputSchema, typeof MoveTaskOutputSchema> {
	readonly name = 'move_task' as const
	readonly inputSchema = MoveTaskInputSchema
	readonly outputSchema = MoveTaskOutputSchema

	constructor(
		private taskRepository: TaskRepository,
		private spaceRepository: SpaceRepository,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const task = await this.taskRepository.findById(input.taskId, tx)
			if (!task) throw new BaseError<ApplicationErrors>('TASK_NOT_FOUND')

			const space = await this.spaceRepository.findById(task.spaceId, tx)
			if (!space || !space.hasList(input.listId))
				throw new BaseError<ApplicationErrors>('LIST_NOT_IN_SPACE')

			task.moveToList(input.listId)
			await this.taskRepository.save(task, tx)
			for (const e of task.pullDomainEvents()) {
				await this.domainEventRepository.save(e, tx)
			}

			return { taskId: task.id.value }
		})
	}
}
