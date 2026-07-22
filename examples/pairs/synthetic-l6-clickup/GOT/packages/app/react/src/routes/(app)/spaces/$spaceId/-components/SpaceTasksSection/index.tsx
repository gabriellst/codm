import type { ComponentProps, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { getRouteApi } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
	getListViewQueryKey,
	getBoardViewQueryKey,
} from '@template/client-typescript/typescript'

import { Button } from '@/components/ui/button'
import { useServerEvents } from '@/hooks'
import { useDialogStore } from '@/stores/useDialogStore'
import { cn } from '@/lib/utils'

import { ListViewSection } from '../ListViewSection'
import { BoardViewSection } from '../BoardViewSection'
import { CreateTaskDialog } from '../CreateTaskDialog'

const routeApi = getRouteApi('/(app)/spaces/$spaceId/')

export function SpaceTasksSection({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const { spaceId } = routeApi.useParams()
	const { view } = routeApi.useSearch()
	const queryClient = useQueryClient()
	const dialog = useDialogStore()

	useServerEvents('integration.shared.task.status_changed', () => {
		queryClient.invalidateQueries({ queryKey: getListViewQueryKey(spaceId) })
		queryClient.invalidateQueries({ queryKey: getBoardViewQueryKey(spaceId) })
	})

	const views: Record<typeof view, ReactNode> = {
		list: <ListViewSection />,
		board: <BoardViewSection />,
	}

	return (
		<div className={cn('flex flex-1 flex-col gap-4', className)} {...props}>
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-semibold">{t('clickup.space.heading')}</h2>
				<Button onClick={() => dialog.show(<CreateTaskDialog spaceId={spaceId} />)}>
					{t('clickup.createTask.trigger')}
				</Button>
			</div>
			{views[view]}
		</div>
	)
}
