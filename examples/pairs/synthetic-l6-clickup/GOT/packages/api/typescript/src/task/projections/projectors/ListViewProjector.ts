import { injectable } from 'tsyringe-neo'
import { Projector } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { TaskCreatedEvent } from '@task/events/TaskCreatedEvent'
import { TaskStatusChangedEvent } from '@task/events/TaskStatusChangedEvent'
import { TaskAssignedEvent } from '@task/events/TaskAssignedEvent'
import { TaskMovedEvent } from '@task/events/TaskMovedEvent'
import { ListViewProjection, type ListViewProjectionEvent } from '../ListViewProjection'
import { ListViewProjectionRepository } from '../ListViewProjectionRepository'

@injectable()
export class ListViewProjector extends Projector<ListViewProjectionEvent> {
	constructor(private repo: ListViewProjectionRepository) {
		super()
	}

	readonly events = [
		'task.created',
		'task.status_changed',
		'task.assigned',
		'task.moved',
	] as const

	async handle(event: ListViewProjectionEvent, tx?: Transaction): Promise<void> {
		if (event instanceof TaskCreatedEvent) {
			await this.repo.insertIfNew(ListViewProjection.create(event), tx)
			return
		}
		if (
			event instanceof TaskStatusChangedEvent ||
			event instanceof TaskAssignedEvent ||
			event instanceof TaskMovedEvent
		) {
			const row = await this.repo.findByKey(event.payload.taskId, tx)
			if (!row) return
			row.applyEvent(event)
			await this.repo.save(row, tx)
		}
	}
}
