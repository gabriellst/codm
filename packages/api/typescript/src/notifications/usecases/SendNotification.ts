import { injectable } from 'tsyringe-neo'
import { BaseError, Handler, z } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { NotificationChannel, NotificationOrigin, NotificationCategory } from '@template/contracts-typescript/wire/enums'
import { Notification } from '../entities/Notification'
import { NotificationDelivery } from '../entities/NotificationDelivery'
import { NotificationRepository } from '../repositories/NotificationRepository'
import { NotificationDeliveryRepository } from '../repositories/NotificationDeliveryRepository'
import { NotificationSentEvent } from '../events'
import type { NotificationsDomainErrors } from '../errors'

export const SendNotificationInputSchema = z.object({
	userId: z.uuid(),
	ownerId: z.uuid().optional(),
	targetUserIds: z.array(z.string()).optional(),
	title: z.string().min(1).max(200),
	content: z.string().min(1),
	category: z.enum(NotificationCategory),
	important: z.boolean().default(false),
	pushEnabled: z.boolean().default(true),
	emailEnabled: z.boolean().default(false),
	contentType: z.string().default('text/plain'),
	payload: z.record(z.string(), z.unknown()).optional(),
	scheduledAt: z.date().optional(),
})

export const SendNotificationOutputSchema = z.object({
	notificationId: z.uuid(),
	deliveriesCreated: z.number().int().min(0),
	deliveriesSkippedDuplicate: z.number().int().min(0),
})

/**
 * C53 SendNotification. Creates one Notification + N
 * NotificationDelivery rows (one per recipient × enabled channel).
 * Requires at least one targetUserId and at least one enabled channel.
 *
 * `scheduledAt` is accepted for SDK compatibility but not yet honored at
 * this layer — the scheduler integration that defers the persist to the
 * requested wall-clock lands in a follow-up iter; for now the rows are
 * created immediately with `deliveredAt = now`.
 */
@injectable()
export class SendNotification extends Handler<typeof SendNotificationInputSchema, typeof SendNotificationOutputSchema> {
	readonly name = 'send_notification' as const
	readonly inputSchema = SendNotificationInputSchema
	readonly outputSchema = SendNotificationOutputSchema

	constructor(
		private readonly notifications: NotificationRepository,
		private readonly deliveries: NotificationDeliveryRepository,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const targets = input.targetUserIds ?? []
		if (targets.length === 0) {
			throw new BaseError<NotificationsDomainErrors>('EMPTY_RECIPIENTS')
		}
		const channels: NotificationChannel[] = []
		if (input.pushEnabled) channels.push(NotificationChannel.PUSH)
		if (input.emailEnabled) channels.push(NotificationChannel.EMAIL)
		if (channels.length === 0) {
			throw new BaseError<NotificationsDomainErrors>('NO_CHANNEL_ENABLED')
		}

		return this.withTransaction(tx, async tx => {
			const notification = Notification.create({
				title: input.title,
				content: input.content,
				category: input.category as NotificationCategory,
				origin: NotificationOrigin.ADMIN,
				important: input.important,
				contentType: input.contentType,
				payload: input.payload,
				ownerId: input.ownerId ?? null,
			})
			await this.notifications.save(notification, tx)

			let deliveriesCreated = 0
			for (const recipient of targets) {
				for (const channel of channels) {
					const delivery = NotificationDelivery.create({
						notificationId: notification.id.value,
						userId: recipient,
						channel,
					})
					await this.deliveries.save(delivery, tx)
					deliveriesCreated++
				}
			}

			await this.domainEventRepository.save(
				new NotificationSentEvent({
					entityId: notification.id.value,
					ownerId: input.ownerId ?? input.userId,
					payload: {
						notificationId: notification.id.value,
						ownerId: input.ownerId ?? null,
						category: input.category,
						channels,
						recipientCount: targets.length,
						deliveriesCreated,
					},
				}),
				tx,
			)

			return {
				notificationId: notification.id.value,
				deliveriesCreated,
				deliveriesSkippedDuplicate: 0,
			}
		})
	}
}
