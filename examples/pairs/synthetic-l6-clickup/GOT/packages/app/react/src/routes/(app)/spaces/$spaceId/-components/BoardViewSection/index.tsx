import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { getRouteApi } from '@tanstack/react-router'
import { useGetBoardView } from '@template/client-typescript/typescript'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

import { TaskCard } from '../TaskCard'

const routeApi = getRouteApi('/(app)/spaces/$spaceId/')

export function BoardViewSection({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const { spaceId } = routeApi.useParams()
	const { data, isPending } = useGetBoardView(spaceId)

	return (
		<div data-testid="board-view" className={cn('flex gap-4 overflow-x-auto', className)} {...props}>
			{isPending ? (
				<>
					<Skeleton className="h-64 min-w-[260px]" />
					<Skeleton className="h-64 min-w-[260px]" />
					<Skeleton className="h-64 min-w-[260px]" />
				</>
			) : (
				data?.columns.map((col) => (
					<div
						key={col.status}
						data-testid={`board-column-${col.status}`}
						className="flex min-w-[260px] flex-col gap-2"
					>
						<h3 className="text-sm font-semibold text-foreground">
							{t(`enums.TaskStatus.${col.status}`)}
						</h3>
						{col.tasks.length === 0 ? (
							<p className="text-sm text-muted-foreground">{t('clickup.board.empty')}</p>
						) : (
							col.tasks.map((task) => (
								<TaskCard
									key={task.taskId}
									taskId={task.taskId}
									title={task.title}
									priority={task.priority}
									assigneeIds={task.assigneeIds}
									status={col.status}
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
