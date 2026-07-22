import { AggregateRoot, BaseError, Id, z } from '@template/core-typescript'
import Z from 'zod'
import { NotificationChannel } from '@template/contracts-typescript/wire/enums'
import type { NotificationsApplicationErrors } from '../errors'

const NotificationDeliverySchema = z.object({
	notificationId: z.instance(Id),
	userId: z.instance(Id),
	channel: z.enum(NotificationChannel),
	deliveredAt: z.date(),
	readAt: z.date().nullable(),
})

export type NotificationDeliveryProps = Z.infer<typeof NotificationDeliverySchema>

/**
 * `NotificationDelivery` per spec § BC10. One row per
 * (notificationId, userId, channel) tuple. Mutated once: `readAt` is
 * stamped when the recipient marks the delivery read.
 */
export class NotificationDelivery extends AggregateRoot<typeof NotificationDeliverySchema> {
	static override schema = NotificationDeliverySchema

	static create(data: { notificationId: string; userId: string; channel: NotificationChannel; deliveredAt?: Date }): NotificationDelivery {
		return new NotificationDelivery({
			notificationId: data.notificationId,
			userId: data.userId,
			channel: data.channel,
			deliveredAt: data.deliveredAt ?? new Date(),
			readAt: null,
		})
	}

	markRead(by: string, at: Date = new Date()): boolean {
		if (this.userId.value !== by) {
			throw new BaseError<NotificationsApplicationErrors>('DELIVERY_NOT_OWNED_BY_USER')
		}
		if (this.readAt !== null) return false // already read
		this.readAt = at
		this.validate()
		return true
	}
}

export interface NotificationDelivery extends NotificationDeliveryProps {}
