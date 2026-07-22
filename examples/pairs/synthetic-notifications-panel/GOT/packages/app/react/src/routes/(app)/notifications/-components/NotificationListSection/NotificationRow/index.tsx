// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-notifications-panel
// task:        synthetic-notifications-panel
// stamp:       agent-wave1-38ff876
// docTreeHash: b5bf4e130a09
// model:       sonnet
// graded:      2026-07-21T20:40:41.055Z
// source:      packages/app/react/src/routes/(app)/notifications/-components/NotificationListSection/NotificationRow/index.tsx (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import type { VariantProps } from 'class-variance-authority'
import {
	IconAlertTriangle,
	IconCheck,
	IconDots,
	IconMailbox,
	IconPlugOff,
	IconShoppingBag,
	IconSpeakerphone,
	IconUserPlus,
	type TablerIcon,
} from '@tabler/icons-react'
import {
	useMarkNotificationRead,
	listNotificationsQueryKey,
	NotificationCategoryEnum,
	type NotificationCategory,
} from '@codedm/client-typescript/typescript'
import { cn } from '@/lib/utils'
import { useLocale } from '@/hooks'
import { useDialogStore } from '@/stores/useDialogStore'
import { Badge, type badgeVariants } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { NotificationDetailDialog } from '../../NotificationDetailDialog'
import type { NotificationItem } from '../../..'

const CATEGORY_ICON: Record<NotificationCategory, TablerIcon> = {
	[NotificationCategoryEnum.ORDER_RECEIVED]: IconShoppingBag,
	[NotificationCategoryEnum.SYNC_ERROR]: IconAlertTriangle,
	[NotificationCategoryEnum.FEATURE_ANNOUNCEMENT]: IconSpeakerphone,
	[NotificationCategoryEnum.DAILY_DIGEST]: IconMailbox,
	[NotificationCategoryEnum.INTEGRATION_DISCONNECTED]: IconPlugOff,
	[NotificationCategoryEnum.INVITATION]: IconUserPlus,
	[NotificationCategoryEnum.OTHER]: IconDots,
}

export const CATEGORY_BADGE_VARIANT: Record<NotificationCategory, VariantProps<typeof badgeVariants>['variant']> = {
	[NotificationCategoryEnum.ORDER_RECEIVED]: 'success',
	[NotificationCategoryEnum.SYNC_ERROR]: 'destructive',
	[NotificationCategoryEnum.FEATURE_ANNOUNCEMENT]: 'info',
	[NotificationCategoryEnum.DAILY_DIGEST]: 'secondary',
	[NotificationCategoryEnum.INTEGRATION_DISCONNECTED]: 'warning',
	[NotificationCategoryEnum.INVITATION]: 'default',
	[NotificationCategoryEnum.OTHER]: 'outline',
}

interface NotificationRowProps extends React.ComponentProps<'div'> {
	notification: NotificationItem
}

export function NotificationRow({ notification, className, ...props }: NotificationRowProps) {
	const { t } = useTranslation()
	const locale = useLocale()
	const queryClient = useQueryClient()
	const { show } = useDialogStore()
	const markAsRead = useMarkNotificationRead()

	const Icon = CATEGORY_ICON[notification.category]

	const handleMarkAsRead = (event: React.MouseEvent) => {
		event.stopPropagation()
		markAsRead.mutate(
			{ data: { notificationDeliveryIds: [notification.id] } },
			{ onSettled: () => queryClient.invalidateQueries({ queryKey: listNotificationsQueryKey() }) },
		)
	}

	return (
		<div
			role="listitem"
			aria-label={t('notificationsPage.row.openAria', { title: notification.title })}
			onClick={() => show(<NotificationDetailDialog notification={notification} />)}
			className={cn(
				'flex cursor-pointer items-start gap-3 rounded-lg border border-border px-4 py-3 transition-colors hover:bg-muted/50',
				!notification.read && 'bg-muted/30',
				className,
			)}
			{...props}
		>
			<div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
				<Icon className="size-4" />
			</div>

			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<div className="flex items-center gap-2">
					{!notification.read && <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />}
					<p className={cn('truncate text-sm text-foreground', !notification.read && 'font-semibold')}>{notification.title}</p>
				</div>
				<p className="line-clamp-2 text-xs text-muted-foreground">{notification.message}</p>
				<div className="flex flex-wrap items-center gap-2">
					<Badge variant={CATEGORY_BADGE_VARIANT[notification.category]}>{t(`enums.NotificationCategory.${notification.category}`)}</Badge>
					<span className="text-[11px] text-muted-foreground">
						{new Date(notification.createdAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}
					</span>
				</div>
			</div>

			{!notification.read && (
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={t('notificationsPage.row.markAsReadAria')}
					disabled={markAsRead.isPending}
					onClick={handleMarkAsRead}
				>
					{markAsRead.isPending ? <Spinner className="size-4" /> : <IconCheck className="size-4" />}
				</Button>
			)}
		</div>
	)
}
