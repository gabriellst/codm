// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-e2e-notifications-flow
// task:        synthetic-e2e-notifications-flow
// stamp:       e2e-notif-iter3
// docTreeHash: ac3703e45efa
// model:       sonnet
// graded:      2026-06-12T00:02:47.630Z
// source:      packages/app/react/src/components/Header/NotificationItem/index.tsx (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
import { type ComponentProps } from 'react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { NotificationCategoryEnum, type NotificationCategory, type ListNotifications200 } from '@codedm/client-typescript/typescript'

export type NotificationListItem = ListNotifications200['items'][number]

const CATEGORY_COLORS: Record<NotificationCategory, string> = {
	[NotificationCategoryEnum.ORDER_RECEIVED]: 'bg-primary',
	[NotificationCategoryEnum.SYNC_ERROR]: 'bg-destructive',
	[NotificationCategoryEnum.FEATURE_ANNOUNCEMENT]: 'bg-accent',
	[NotificationCategoryEnum.DAILY_DIGEST]: 'bg-chart-4',
	[NotificationCategoryEnum.INTEGRATION_DISCONNECTED]: 'bg-destructive',
	[NotificationCategoryEnum.INVITATION]: 'bg-primary',
	[NotificationCategoryEnum.OTHER]: 'bg-muted-foreground',
}

interface NotificationItemProps extends ComponentProps<'div'> {
	notification: NotificationListItem
}

export function NotificationItem({ notification, className, ...props }: NotificationItemProps) {
	const relativeTime = formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })

	return (
		<div className={cn('p-3 hover:bg-muted/50 transition-colors cursor-pointer', className)} data-slot="notification-item" {...props}>
			<div className="flex items-start gap-3">
				<div className={cn('size-2 rounded-full mt-1.5 shrink-0', CATEGORY_COLORS[notification.category])} />
				<div className="flex-1 min-w-0">
					<p className="font-medium text-sm truncate">{notification.title}</p>
					<p className="text-xs text-muted-foreground line-clamp-2">{notification.message}</p>
					<p className="text-[11px] text-muted-foreground mt-1">{relativeTime}</p>
				</div>
			</div>
		</div>
	)
}
