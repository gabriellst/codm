// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-e2e-notifications-flow
// task:        synthetic-e2e-notifications-flow
// stamp:       e2e-notif-iter3
// docTreeHash: ac3703e45efa
// model:       sonnet
// graded:      2026-06-12T00:02:47.630Z
// source:      packages/e2e/tests/07-notifications-flow.spec.ts (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
import {
	listNotificationsQueryKey,
	NotificationOriginEnum,
	type ListNotificationsQueryResponse,
} from '@template/client-typescript/typescript'
import { test, expect } from '../utils/test'
import { mockRoute } from '../utils/mock'
import { t } from '../utils/i18n'

test.describe('Notifications flow', () => {
	test('empty inbox — bell popover shows all-caught-up copy', async ({ page, goto, given }) => {
		await given.freshUser()

		const emptyResponse: ListNotificationsQueryResponse = { items: [], total: 0, totalPages: 0 }
		await mockRoute<ListNotificationsQueryResponse>(page, listNotificationsQueryKey, emptyResponse)

		await goto('/dashboard')
		await expect(page).toHaveURL(/\/dashboard/)

		await page.getByRole('button', { name: t('notifications.aria') }).click()

		await expect(page.getByRole('heading', { name: t('notifications.title') })).toBeVisible()
		await expect(page.getByText(t('notifications.allCaughtUp'))).toBeVisible()
	})

	test('seeded inbox — bell popover shows seeded notification title', async ({ page, goto, given }) => {
		const { notifications } = await given.userWithNotifications()
		const seeded = notifications[0]

		const seededResponse: ListNotificationsQueryResponse = {
			items: [
				{
					id: seeded.notificationId,
					title: seeded.title,
					message: seeded.message,
					category: seeded.category,
					origin: NotificationOriginEnum.SYSTEM,
					read: false,
					createdAt: new Date().toISOString(),
				},
			],
			total: 1,
			totalPages: 1,
		}
		await mockRoute<ListNotificationsQueryResponse>(page, listNotificationsQueryKey, seededResponse)

		await goto('/dashboard')
		await expect(page).toHaveURL(/\/dashboard/)

		await page.getByRole('button', { name: t('notifications.aria') }).click()

		await expect(page.getByRole('heading', { name: t('notifications.title') })).toBeVisible()
		await expect(page.getByText(seeded.title)).toBeVisible()
	})

	test('notification preferences round-trip — email switch + save shows success toast', async ({ page, goto, given }) => {
		await given.freshUser()

		await goto('/settings/account')
		await expect(page).toHaveURL(/\/settings\/account/)

		const emailSwitch = page.getByRole('switch', { name: t('account.preferences.emailNotifications') })
		await emailSwitch.click()

		await page.getByRole('button', { name: t('account.preferences.save') }).click()

		await expect(page.getByText(t('account.preferences.saveSuccess'))).toBeVisible()
	})
})
