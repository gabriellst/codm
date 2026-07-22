// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-e2e-notifications-flow
// task:        synthetic-e2e-notifications-flow
// stamp:       e2e-notif-iter3
// docTreeHash: ac3703e45efa
// model:       sonnet
// graded:      2026-06-12T00:02:47.630Z
// source:      packages/app/react/src/components/Header/NotificationsPopover/index.tsx (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
import { IconBell } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { useListNotifications } from '@codedm/client-typescript/typescript'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription } from '@/components/ui/empty'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { NotificationItem } from '../NotificationItem'

export function NotificationsPopover() {
	const { t } = useTranslation()
	const { data } = useListNotifications()
	const notifications = data?.items ?? []
	const hasUnread = notifications.some(n => !n.read)

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
