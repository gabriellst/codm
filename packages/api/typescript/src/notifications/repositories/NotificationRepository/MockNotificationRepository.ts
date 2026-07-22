import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@template/core-typescript'
import { Notification } from '../../entities/Notification'
import { NotificationRepository } from './NotificationRepository'

@injectable()
export class MockNotificationRepository extends NotificationRepository {
	private rows = new Map<string, Notification>()

	async findById(id: string, _tx?: Transaction): Promise<Notification | undefined> {
		return this.rows.get(id)
	}

	async save(entity: Notification, _tx?: Transaction): Promise<Notification> {
		entity.incrementVersion()
		this.rows.set(entity.id.value, entity)
		return entity
	}

	async delete(id: string, _tx?: Transaction): Promise<void> {
		this.rows.delete(id)
	}

	seed(entity: Notification): void {
		this.rows.set(entity.id.value, entity)
	}

	clear(): void {
		this.rows.clear()
	}

	all(): Notification[] {
		return Array.from(this.rows.values())
	}
}
