import { NotificationCategory, NotificationChannel } from '@template/contracts-typescript/wire/enums'
import { BaseDomainEvent, z } from '@template/core-typescript'

export const NotificationSentEventSchema = z.domainEvent({
	notificationId: z.uuid(),
	ownerId: z.uuid().nullable(),
	category: z.enum(NotificationCategory),
	channels: z.array(z.enum(NotificationChannel)),
	recipientCount: z.number().int().min(0),
	deliveriesCreated: z.number().int().min(0),
})

export class NotificationSentEvent extends BaseDomainEvent<typeof NotificationSentEventSchema> {
	static override readonly name = 'notifications.notification.sent' as const
	static readonly schema = NotificationSentEventSchema
}
