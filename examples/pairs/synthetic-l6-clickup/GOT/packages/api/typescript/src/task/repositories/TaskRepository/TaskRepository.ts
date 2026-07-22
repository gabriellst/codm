import { Repository } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { Task } from '../../entities'

export abstract class TaskRepository extends Repository<Task> {
	abstract findById(id: string, tx?: Transaction): Promise<Task | undefined>
}
