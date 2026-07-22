import { type ComponentProps } from 'react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'

export type NotificationLevel = 'ERROR' | 'WARNING' | 'SUCCESS' | 'INFO'

export interface Notification {
	id: string
	title: string
	content: string
	createdAt: Date | string
	level: NotificationLevel
}

const NOTIFICATION_LEVEL_COLORS: Record<NotificationLevel, string> = {
	ERROR: 'bg-destructive',
	WARNING: 'bg-chart-4',
	SUCCESS: 'bg-primary',
	INFO: 'bg-accent',
}

const formatRelativeTime = (date: Date | string) => {
	const dateObj = typeof date === 'string' ? new Date(date) : date
	return formatDistanceToNow(dateObj, { addSuffix: true })
}

interface NotificationItemProps extends ComponentProps<'div'> {
	notification: Notification
}

export function NotificationItem({ notification, className, ...props }: NotificationItemProps) {
	return (
		<div className={cn('p-3 hover:bg-muted/50 transition-colors cursor-pointer', className)} data-slot="notification-item" {...props}>
			<div className="flex items-start gap-3">
				<div className={cn('size-2 rounded-full mt-1.5 shrink-0', NOTIFICATION_LEVEL_COLORS[notification.level])} />
				<div className="flex-1 min-w-0">
					<p className="font-medium text-sm truncate">{notification.title}</p>
					<p className="text-xs text-muted-foreground line-clamp-2">{notification.content}</p>
					<p className="text-[11px] text-muted-foreground mt-1">{formatRelativeTime(notification.createdAt)}</p>
				</div>
			</div>
		</div>
	)
}
