import { injectable } from 'tsyringe-neo'
import { BaseError, Handler, z } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { NotificationDeliveryRepository } from '../repositories/NotificationDeliveryRepository'
import { NotificationDeliveryReadEvent } from '../events'
import type { NotificationsApplicationErrors } from '../errors'

export const MarkNotificationReadInputSchema = z.object({
	userId: z.uuid(),
	notificationDeliveryIds: z.array(z.uuid()).min(1),
})

export const MarkNotificationReadOutputSchema = z.void()

/**
 * C55 MarkNotificationRead. Marks every delivery in `notificationDeliveryIds`
 * read for the calling user. Idempotent — already-read deliveries are a no-op
 * (one read event emitted per delivery that actually transitions).
 */
@injectable()
export class MarkNotificationRead extends Handler<typeof MarkNotificationReadInputSchema, typeof MarkNotificationReadOutputSchema> {
	readonly name = 'mark_notification_read' as const
	readonly inputSchema = MarkNotificationReadInputSchema
	readonly outputSchema = MarkNotificationReadOutputSchema

	constructor(private readonly deliveries: NotificationDeliveryRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		await this.withTransaction(tx, async tx => {
			for (const notificationDeliveryId of input.notificationDeliveryIds) {
				const delivery = await this.deliveries.findById(notificationDeliveryId, tx)
				if (!delivery) {
					throw new BaseError<NotificationsApplicationErrors>('NOTIFICATION_DELIVERY_NOT_FOUND')
				}
				const changed = delivery.markRead(input.userId)
				if (!changed) continue // already-read, idempotent
				if (delivery.readAt === null) continue
				const readAt = delivery.readAt

				await this.deliveries.save(delivery, tx)
				await this.domainEventRepository.save(
					new NotificationDeliveryReadEvent({
						entityId: delivery.id.value,
						ownerId: delivery.userId.value,
						payload: {
							notificationDeliveryId: delivery.id.value,
							notificationId: delivery.notificationId.value,
							userId: delivery.userId.value,
							readAt,
						},
					}),
					tx,
				)
			}
		})

		return
	}
}
