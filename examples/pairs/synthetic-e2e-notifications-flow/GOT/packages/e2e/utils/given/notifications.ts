// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-e2e-notifications-flow
// task:        synthetic-e2e-notifications-flow
// stamp:       e2e-notif-iter3
// docTreeHash: ac3703e45efa
// model:       sonnet
// graded:      2026-06-12T00:02:47.630Z
// source:      packages/e2e/utils/given/notifications.ts (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
import type { BrowserContext } from 'playwright'
import {
	sendNotification,
	getSession,
	NotificationCategoryEnum,
	type NotificationCategory,
} from '@template/client-typescript/typescript'
import { givenFreshUser, type FreshUser } from './user'

export interface SeededNotification {
	notificationId: string
	title: string
	message: string
	category: NotificationCategory
}

export interface UserWithNotifications extends FreshUser {
	notifications: SeededNotification[]
}

export async function givenUserWithNotifications(
	context: BrowserContext,
	params?: {
		notificationCount?: number
		user?: Parameters<typeof givenFreshUser>[1]
	},
): Promise<UserWithNotifications> {
	const user = await givenFreshUser(context, params?.user)

	const sessionData = await getSession({ client: user.session.client })
	const userId = sessionData.user.id

	const count = params?.notificationCount ?? 1
	const notifications: SeededNotification[] = []

	for (let i = 0; i < count; i++) {
		const title = `Notificação de teste ${i + 1}`
		const message = `Mensagem de teste ${i + 1}`

		const result = await sendNotification(
			{
				targetUserIds: [userId],
				title,
				content: message,
				category: NotificationCategoryEnum.ORDER_RECEIVED,
				pushEnabled: true,
			},
			{ client: user.session.client },
		)

		notifications.push({
			notificationId: result.notificationId,
			title,
			message,
			category: NotificationCategoryEnum.ORDER_RECEIVED,
		})
	}

	return { ...user, notifications }
}
