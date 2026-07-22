import { getRouteApi } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { ComponentProps } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const routeApi = getRouteApi('/(app)/spaces/$spaceId/')

export function SpaceViewToggle({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const { view } = routeApi.useSearch()
	const navigate = routeApi.useNavigate()

	return (
		<div className={cn('flex gap-2', className)} {...props}>
			<Button
				variant={view === 'list' ? 'default' : 'outline'}
				onClick={() => navigate({ search: prev => ({ ...prev, view: 'list' }) })}
			>
				{t('clickup.view.list')}
			</Button>
			<Button
				variant={view === 'board' ? 'default' : 'outline'}
				onClick={() => navigate({ search: prev => ({ ...prev, view: 'board' }) })}
			>
				{t('clickup.view.board')}
			</Button>
		</div>
	)
}
