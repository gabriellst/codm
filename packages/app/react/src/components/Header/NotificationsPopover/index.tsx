import { IconBell } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@codm/app-ui/button'
import { Empty, EmptyDescription } from '@codm/app-ui/empty'
import { Popover, PopoverContent, PopoverTrigger } from '@codm/app-ui/popover'
import { NotificationItem, type Notification } from '../NotificationItem'

interface NotificationsPopoverProps {
	notifications: Notification[]
}

export function NotificationsPopover({ notifications }: NotificationsPopoverProps) {
	const { t } = useTranslation()
	const hasUnread = notifications.length > 0

	return (
		<Popover>
			<PopoverTrigger
				render={
					<Button
						variant="ghost"
						size="icon"
						className="relative text-muted-foreground hover:text-foreground"
						aria-label={t('notifications.aria')}
					>
						<IconBell className="size-5" />
						{hasUnread && <span className="absolute top-1.5 right-1.5 size-2 bg-destructive rounded-full" />}
					</Button>
				}
			/>
			<PopoverContent align="end" className="w-80 p-0" data-slot="notifications-popover">
				<div className="p-3 border-b border-border">
					<h3 className="font-semibold">{t('notifications.title')}</h3>
					<p className="text-xs text-muted-foreground">{t('notifications.unreadCount', { count: notifications.length })}</p>
				</div>
				<div className="max-h-80 overflow-y-auto">
					{notifications.length === 0 ? (
						<Empty className="border-none py-4">
							<EmptyDescription>{t('notifications.allCaughtUp')}</EmptyDescription>
						</Empty>
					) : (
						notifications.map(n => <NotificationItem key={n.id} notification={n} />)
					)}
				</div>
			</PopoverContent>
		</Popover>
	)
}
