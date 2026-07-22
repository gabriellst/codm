import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { getRouteApi } from '@tanstack/react-router'
import { useGetListView } from '@template/client-typescript/typescript'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

import { TaskCard } from '../TaskCard'

const routeApi = getRouteApi('/(app)/spaces/$spaceId/')

export function ListViewSection({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const { spaceId } = routeApi.useParams()
	const { data, isPending } = useGetListView(spaceId)

	return (
		<div data-testid="list-view" className={cn('flex flex-col gap-4', className)} {...props}>
			{isPending ? (
				<>
					<Skeleton className="h-24 w-full" />
					<Skeleton className="h-24 w-full" />
					<Skeleton className="h-24 w-full" />
				</>
			) : (
				data?.lists.map((list) => (
					<div key={list.listId} className="flex flex-col gap-2">
						<h3 className="text-sm font-semibold text-foreground">{list.name}</h3>
						{list.tasks.length === 0 ? (
							<p className="text-sm text-muted-foreground">{t('clickup.list.empty')}</p>
						) : (
							list.tasks.map((task) => (
								<TaskCard
									key={task.taskId}
									taskId={task.taskId}
									title={task.title}
									priority={task.priority}
									assigneeIds={task.assigneeIds}
									status={task.status}
									spaceId={spaceId}
								/>
							))
						)}
					</div>
				))
			)}
		</div>
	)
}
