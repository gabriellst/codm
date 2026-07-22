import { Repository } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import type { NotificationCategory } from '@template/contracts-typescript/wire/enums'
import { NotificationDelivery } from '../../entities/NotificationDelivery'

export interface InboxQuery {
	userId: string
	unreadOnly: boolean
	categories?: NotificationCategory[]
	page: number
	limit: number
}

export interface InboxJoinedRow {
	delivery: NotificationDelivery
	notification: {
		notificationId: string
		title: string
		content: string
		category: NotificationCategory
		important: boolean
		origin: string
		payload: Record<string, unknown>
	}
}

export interface InboxResult {
	total: number
	unreadCount: number
	items: InboxJoinedRow[]
}

export abstract class NotificationDeliveryRepository extends Repository<NotificationDelivery> {
	abstract findById(id: string, tx?: Transaction): Promise<NotificationDelivery | undefined>
	abstract inbox(query: InboxQuery, tx?: Transaction): Promise<InboxResult>
}
