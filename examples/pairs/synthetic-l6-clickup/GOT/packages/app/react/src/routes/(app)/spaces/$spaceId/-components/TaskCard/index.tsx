import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import {
	useChangeTaskStatus,
	useAssignTask,
	getListViewQueryKey,
	getBoardViewQueryKey,
	TaskStatusEnum,
	type TaskStatus,
} from '@template/client-typescript/typescript'

import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useSession } from '@/hooks'

export interface TaskCardProps extends ComponentProps<'div'> {
	taskId: string
	title: string
	priority: string
	assigneeIds: string[]
	status: string
	spaceId: string
}

export function TaskCard({ taskId, title, priority, assigneeIds, status, spaceId, className, ...props }: TaskCardProps) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const session = useSession()

	const changeStatus = useChangeTaskStatus({
		mutation: {
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: getListViewQueryKey(spaceId) })
				queryClient.invalidateQueries({ queryKey: getBoardViewQueryKey(spaceId) })
			},
		},
	})

	const assign = useAssignTask({
		mutation: {
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: getListViewQueryKey(spaceId) })
				queryClient.invalidateQueries({ queryKey: getBoardViewQueryKey(spaceId) })
			},
		},
	})

	const userId = session?.user.id

	return (
		<div
			data-testid={`task-card-${taskId}`}
			className={cn('flex flex-col gap-2 rounded-lg border border-border bg-card p-3', className)}
			{...props}
		>
			<span className="text-sm font-medium text-foreground">{title}</span>

			<span className="inline-flex w-fit items-center rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
				{t(`enums.TaskPriority.${priority}`)}
			</span>

			<span className="text-xs text-muted-foreground">
				{assigneeIds.length} {t('clickup.task.assigneeCount')}
			</span>

			<div className="flex items-center gap-2">
				<Select
					enum={TaskStatusEnum}
					i18nPrefix="enums.TaskStatus"
					value={status as TaskStatus}
					onValueChange={(newStatus) => {
						changeStatus.mutate({ taskId, data: { toStatus: newStatus } })
					}}
					placeholder={t('clickup.task.statusLabel')}
				/>

				<Button
					variant="outline"
					size="sm"
					onClick={() => {
						if (!userId) return
						assign.mutate({
							taskId,
							data: { assigneeIds: [...new Set([...assigneeIds, userId])] },
						})
					}}
				>
					{t('clickup.task.assignLabel')}
				</Button>
			</div>
		</div>
	)
}
