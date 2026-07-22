// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-notifications-panel
// task:        synthetic-notifications-panel
// stamp:       agent-wave1-38ff876
// docTreeHash: b5bf4e130a09
// model:       sonnet
// graded:      2026-07-21T20:40:41.055Z
// source:      packages/app/react/src/routes/(app)/notifications/-components/NotificationListSection/index.tsx (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
import * as React from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { IconBellOff, IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { useListNotifications } from '@codedm/client-typescript/typescript'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Button } from '@/components/ui/button'
import { NotificationRow } from './NotificationRow'
import type { NotificationItem } from '../../'

const routeApi = getRouteApi('/(app)/notifications/')

function SkeletonRows() {
	return (
		<div className="flex flex-col gap-2">
			{[1, 2, 3, 4, 5].map(key => (
				<div key={key} className="flex items-center gap-4 rounded-lg border border-border px-4 py-3">
					<Skeleton className="size-8 shrink-0 rounded-full" />
					<div className="flex flex-1 flex-col gap-1.5">
						<Skeleton className="h-4 w-48" />
						<Skeleton className="h-3 w-72" />
					</div>
				</div>
			))}
		</div>
	)
}

interface NotificationListSectionProps extends React.ComponentProps<'section'> {}

export function NotificationListSection({ className, ...props }: NotificationListSectionProps) {
	const { page, limit, unreadOnly, category } = routeApi.useSearch()
	const navigate = routeApi.useNavigate()
	const { t } = useTranslation()

	const { data } = useListNotifications({ page, limit, unreadOnly })

	// NotificationCategory has no server-side filter (backend param doesn't exist) —
	// narrow the fetched page client-side instead.
	const items: NotificationItem[] | undefined = data && (category ? data.items.filter(n => n.category === category) : data.items)

	return (
		<section className={cn('flex flex-col gap-3', className)} {...props}>
			{data === undefined ? (
				<SkeletonRows />
			) : items && items.length === 0 ? (
				<Empty className="py-12">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<IconBellOff />
						</EmptyMedia>
						<EmptyTitle>{t('notificationsPage.list.empty.title')}</EmptyTitle>
						<EmptyDescription>{t('notificationsPage.list.empty.description')}</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<div className="flex flex-col gap-2" role="list" aria-label={t('notificationsPage.list.ariaLabel')}>
					{items?.map(item => (
						<NotificationRow key={item.id} notification={item} />
					))}
				</div>
			)}

			{data && data.totalPages > 1 && (
				<div className="flex items-center justify-between border-t border-border px-1 py-3">
					<span className="text-xs text-muted-foreground">
						{t('notificationsPage.list.pagination.summary', { page: page ?? 1, totalPages: data.totalPages, total: data.total })}
					</span>
					<div className="flex items-center gap-1">
						<Button
							variant="outline"
							size="icon-sm"
							aria-label={t('notificationsPage.list.pagination.previous')}
							disabled={(page ?? 1) <= 1}
							onClick={() => navigate({ search: prev => ({ ...prev, page: (prev.page ?? 1) - 1 }) })}
						>
							<IconChevronLeft className="size-4" />
						</Button>
						<Button
							variant="outline"
							size="icon-sm"
							aria-label={t('notificationsPage.list.pagination.next')}
							disabled={(page ?? 1) >= data.totalPages}
							onClick={() => navigate({ search: prev => ({ ...prev, page: (prev.page ?? 1) + 1 }) })}
						>
							<IconChevronRight className="size-4" />
						</Button>
					</div>
				</div>
			)}
		</section>
	)
}
