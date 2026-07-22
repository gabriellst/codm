import { injectable } from 'tsyringe-neo'
import { Handler, BaseError, z } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { TaskRepository } from '../repositories/TaskRepository/TaskRepository'
import type { ApplicationErrors } from '../errors'

export const AssignTaskInputSchema = z.object({
	taskId: z.uuid(),
	assigneeIds: z.array(z.uuid()),
})

export const AssignTaskOutputSchema = z.object({
	taskId: z.uuid(),
})

@injectable()
export class AssignTask extends Handler<
	typeof AssignTaskInputSchema,
	typeof AssignTaskOutputSchema
> {
	readonly name = 'assign_task' as const
	readonly inputSchema = AssignTaskInputSchema
	readonly outputSchema = AssignTaskOutputSchema

	constructor(private taskRepository: TaskRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const task = await this.taskRepository.findById(input.taskId, tx)
			if (!task) throw new BaseError<ApplicationErrors>('TASK_NOT_FOUND')

			task.assign(input.assigneeIds)
			await this.taskRepository.save(task, tx)
			for (const e of task.pullDomainEvents()) {
				await this.domainEventRepository.save(e, tx)
			}

			return { taskId: task.id.value }
		})
	}
}
