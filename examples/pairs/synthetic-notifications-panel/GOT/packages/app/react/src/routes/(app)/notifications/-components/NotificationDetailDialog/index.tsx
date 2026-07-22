// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-notifications-panel
// task:        synthetic-notifications-panel
// stamp:       agent-wave1-38ff876
// docTreeHash: b5bf4e130a09
// model:       sonnet
// graded:      2026-07-21T20:40:41.055Z
// source:      packages/app/react/src/routes/(app)/notifications/-components/NotificationDetailDialog/index.tsx (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useMarkNotificationRead, listNotificationsQueryKey } from '@template/client-typescript/typescript'
import { useLocale } from '@/hooks'
import { useDialogStore } from '@/stores/useDialogStore'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CATEGORY_BADGE_VARIANT } from '../NotificationListSection/NotificationRow'
import type { NotificationItem } from '../..'

interface NotificationDetailDialogProps {
	notification: NotificationItem
}

export function NotificationDetailDialog({ notification }: NotificationDetailDialogProps) {
	const { t } = useTranslation()
	const locale = useLocale()
	const queryClient = useQueryClient()
	const { hide } = useDialogStore()
	const markAsRead = useMarkNotificationRead()

	const handleMarkAsRead = () => {
		markAsRead.mutate(
			{ data: { notificationDeliveryIds: [notification.id] } },
			{
				onSuccess: () => hide(),
				onSettled: () => queryClient.invalidateQueries({ queryKey: listNotificationsQueryKey() }),
			},
		)
	}

	return (
		<DialogContent className="sm:max-w-md">
			<DialogHeader>
				<DialogTitle>{notification.title}</DialogTitle>
				<DialogDescription>{notification.message}</DialogDescription>
			</DialogHeader>

			<div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
				<span className="flex items-center gap-1.5">
					<span className="font-medium text-foreground">{t('notificationsPage.detail.categoryLabel')}:</span>
					<Badge variant={CATEGORY_BADGE_VARIANT[notification.category]}>{t(`enums.NotificationCategory.${notification.category}`)}</Badge>
				</span>
				<span>
					<span className="font-medium text-foreground">{t('notificationsPage.detail.createdAtLabel')}:</span>{' '}
					{new Date(notification.createdAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}
				</span>
				<Badge variant={notification.read ? 'secondary' : 'default'}>
					{notification.read ? t('notificationsPage.detail.readLabel') : t('notificationsPage.detail.unreadLabel')}
				</Badge>
			</div>

			<DialogFooter>
				<DialogClose render={<Button variant="outline" />}>{t('notificationsPage.detail.close')}</DialogClose>
				{!notification.read && (
					<Button onClick={handleMarkAsRead} disabled={markAsRead.isPending}>
						{markAsRead.isPending && <Spinner className="size-4" />}
						{t('notificationsPage.detail.markAsRead')}
					</Button>
				)}
			</DialogFooter>
		</DialogContent>
	)
}
