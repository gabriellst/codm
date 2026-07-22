import { injectable } from 'tsyringe-neo'
import { Handler, BaseError, z } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { TaskRepository } from '../repositories/TaskRepository/TaskRepository'
import type { ApplicationErrors } from '../errors'
import { TaskStatus } from '@template/contracts-typescript/wire/enums'

export const ChangeTaskStatusInputSchema = z.object({
	taskId: z.uuid(),
	toStatus: z.enum(TaskStatus),
})

export const ChangeTaskStatusOutputSchema = z.object({
	taskId: z.uuid(),
	status: z.enum(TaskStatus),
})

@injectable()
export class ChangeTaskStatus extends Handler<
	typeof ChangeTaskStatusInputSchema,
	typeof ChangeTaskStatusOutputSchema
> {
	readonly name = 'change_task_status' as const
	readonly inputSchema = ChangeTaskStatusInputSchema
	readonly outputSchema = ChangeTaskStatusOutputSchema

	constructor(private taskRepository: TaskRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const task = await this.taskRepository.findById(input.taskId, tx)
			if (!task) throw new BaseError<ApplicationErrors>('TASK_NOT_FOUND')

			task.changeStatus(input.toStatus)
			await this.taskRepository.save(task, tx)
			for (const e of task.pullDomainEvents()) {
				await this.domainEventRepository.save(e, tx)
			}

			return { taskId: task.id.value, status: task.status }
		})
	}
}
