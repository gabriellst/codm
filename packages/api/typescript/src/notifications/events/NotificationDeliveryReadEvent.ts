import { BaseDomainEvent, z } from '@template/core-typescript'

export const NotificationDeliveryReadEventSchema = z.domainEvent({
	notificationDeliveryId: z.uuid(),
	notificationId: z.uuid(),
	userId: z.uuid(),
	readAt: z.date(),
})

export class NotificationDeliveryReadEvent extends BaseDomainEvent<typeof NotificationDeliveryReadEventSchema> {
	static override readonly name = 'notifications.notification_delivery.read' as const
	static readonly schema = NotificationDeliveryReadEventSchema
}
