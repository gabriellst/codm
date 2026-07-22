import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@template/core-typescript'
import type { NotificationCategory, NotificationOrigin } from '@template/contracts-typescript/wire/enums'
import { NotificationDelivery } from '../../entities/NotificationDelivery'
import { NotificationRepository } from '../NotificationRepository'
import { NotificationDeliveryRepository, type InboxJoinedRow, type InboxQuery, type InboxResult } from './NotificationDeliveryRepository'

@injectable()
export class MockNotificationDeliveryRepository extends NotificationDeliveryRepository {
	private rows = new Map<string, NotificationDelivery>()

	constructor(private readonly notifications: NotificationRepository) {
		super()
	}

	async findById(id: string, _tx?: Transaction): Promise<NotificationDelivery | undefined> {
		return this.rows.get(id)
	}

	async inbox(query: InboxQuery, _tx?: Transaction): Promise<InboxResult> {
		const userRows = [...this.rows.values()].filter(d => d.userId.value === query.userId)

		const joined: InboxJoinedRow[] = []
		for (const d of userRows) {
			const n = await this.notifications.findById(d.notificationId.value)
			if (!n) continue
			if (query.categories !== undefined && query.categories.length > 0 && !query.categories.includes(n.category as NotificationCategory))
				continue
			joined.push({
				delivery: d,
				notification: {
					notificationId: d.notificationId.value,
					title: n.title,
					content: n.content,
					category: n.category as NotificationCategory,
					important: n.important,
					origin: n.origin as NotificationOrigin,
					payload: n.payload as Record<string, unknown>,
				},
			})
		}

		const filtered = query.unreadOnly ? joined.filter(r => r.delivery.readAt === null) : joined
		filtered.sort((a, b) => (a.delivery.deliveredAt < b.delivery.deliveredAt ? 1 : -1))

		const unreadCount = joined.filter(r => r.delivery.readAt === null).length
		const start = (query.page - 1) * query.limit
		return {
			total: filtered.length,
			unreadCount,
			items: filtered.slice(start, start + query.limit),
		}
	}

	async save(entity: NotificationDelivery, _tx?: Transaction): Promise<NotificationDelivery> {
		entity.incrementVersion()
		this.rows.set(entity.id.value, entity)
		return entity
	}

	async delete(id: string, _tx?: Transaction): Promise<void> {
		this.rows.delete(id)
	}

	seed(entity: NotificationDelivery): void {
		this.rows.set(entity.id.value, entity)
	}

	clear(): void {
		this.rows.clear()
	}

	all(): NotificationDelivery[] {
		return Array.from(this.rows.values())
	}
}
