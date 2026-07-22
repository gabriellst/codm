// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-notifications-panel
// task:        synthetic-notifications-panel
// stamp:       agent-wave1-38ff876
// docTreeHash: b5bf4e130a09
// model:       sonnet
// graded:      2026-07-21T20:40:41.055Z
// source:      packages/app/react/src/routes/(app)/notifications/-components/NotificationFilterBar/index.tsx (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
import { getRouteApi } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import * as React from 'react'
import { NotificationCategoryEnum } from '@template/client-typescript/typescript'
import { cn } from '@/lib/utils'
import { isEnumValue } from '@/lib/enums'
import { FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

const routeApi = getRouteApi('/(app)/notifications/')

const CATEGORIES = Object.values(NotificationCategoryEnum)
const ALL_CATEGORIES = '__all__'

interface NotificationFilterBarProps extends React.ComponentProps<'div'> {}

export function NotificationFilterBar({ className, ...props }: NotificationFilterBarProps) {
	const { category, unreadOnly } = routeApi.useSearch()
	const navigate = routeApi.useNavigate()
	const { t } = useTranslation()

	const handleCategoryChange = (value: string | null) => {
		navigate({
			search: prev => ({
				...prev,
				category: isEnumValue(NotificationCategoryEnum, value) ? value : undefined,
				page: 1,
			}),
		})
	}

	return (
		<div className={cn('flex flex-wrap items-center gap-4', className)} {...props}>
			<div className="flex flex-col gap-1.5">
				<FieldLabel htmlFor="notification-category-filter">{t('notificationsPage.filters.categoryLabel')}</FieldLabel>
				<Select value={category ?? ALL_CATEGORIES} onValueChange={handleCategoryChange}>
					<SelectTrigger id="notification-category-filter" className="w-56" aria-label={t('notificationsPage.filters.categoryLabel')}>
						<SelectValue>
							{category ? t(`enums.NotificationCategory.${category}`) : t('notificationsPage.filters.allCategories')}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ALL_CATEGORIES}>{t('notificationsPage.filters.allCategories')}</SelectItem>
						{CATEGORIES.map(value => (
							<SelectItem key={value} value={value}>
								{t(`enums.NotificationCategory.${value}`)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="flex items-center gap-2">
				<Switch
					id="notification-unread-only"
					checked={unreadOnly ?? false}
					onCheckedChange={checked => navigate({ search: prev => ({ ...prev, unreadOnly: checked || undefined, page: 1 }) })}
				/>
				<FieldLabel htmlFor="notification-unread-only">{t('notificationsPage.filters.unreadOnly')}</FieldLabel>
			</div>
		</div>
	)
}
