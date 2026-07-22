import { Repository } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { Notification } from '../../entities/Notification'

export abstract class NotificationRepository extends Repository<Notification> {
	abstract findById(id: string, tx?: Transaction): Promise<Notification | undefined>
}
