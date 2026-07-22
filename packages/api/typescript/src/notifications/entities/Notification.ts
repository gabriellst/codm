import { AggregateRoot, Id, z } from '@template/core-typescript'
import Z from 'zod'
import { NotificationCategory, NotificationOrigin } from '@template/contracts-typescript/wire/enums'

const NotificationSchema = z.object({
	title: z.string().min(1).max(200),
	content: z.string().min(1),
	category: z.enum(NotificationCategory),
	origin: z.enum(NotificationOrigin),
	important: z.boolean().default(false),
	contentType: z.string().default('text/plain'),
	payload: z.record(z.string(), z.unknown()).default({}),
	ownerId: z.instance(Id).nullable(),
})

export type NotificationProps = Z.infer<typeof NotificationSchema>

/**
 * `Notification` per spec § BC10. The source notification — one
 * per Send call. Per-recipient × channel rows live on
 * `NotificationDelivery` and reference back by notificationId.
 */
export class Notification extends AggregateRoot<typeof NotificationSchema> {
	static override schema = NotificationSchema

	static create(data: {
		title: string
		content: string
		category: NotificationCategory
		origin: NotificationOrigin
		important?: boolean
		contentType?: string
		payload?: Record<string, unknown>
		ownerId?: string | null
	}): Notification {
		return new Notification({
			title: data.title,
			content: data.content,
			category: data.category,
			origin: data.origin,
			important: data.important ?? false,
			contentType: data.contentType ?? 'text/plain',
			payload: data.payload ?? {},
			ownerId: data.ownerId ?? null,
		})
	}
}

export interface Notification extends NotificationProps {}
