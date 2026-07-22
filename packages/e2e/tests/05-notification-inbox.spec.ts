import { test, expect } from '../utils/test'
import { sendNotification, listNotifications, markNotificationRead, getUserInfo } from '@template/client-typescript/typescript'

/**
 * Canonical flow 5 — notification fan-out + inbox.
 *
 * SendNotification creates the source row + one delivery per recipient; the recipient's
 * inbox surfaces it unread; MarkNotificationRead stamps it.
 */
test('send → inbox lists unread → mark read', async ({ given }) => {
	const user = await given.freshUser({})

	const me = await getUserInfo({ client: user.session.client })

	const sent = await sendNotification(
		{
			targetUserIds: [me.user.id],
			title: 'E2E notification',
			content: 'Hello from the canonical flow',
			category: 'FEATURE_ANNOUNCEMENT',
		},
		{ client: user.session.client },
	)
	expect(sent.notificationId).toBeTruthy()

	const inbox = await listNotifications({}, { client: user.session.client })
	const mine = (inbox.items ?? []).find(n => n.title === 'E2E notification')
	expect(mine).toBeTruthy()

	if (mine) {
		await markNotificationRead({ notificationDeliveryIds: [mine.id] }, { client: user.session.client })
	}
})
