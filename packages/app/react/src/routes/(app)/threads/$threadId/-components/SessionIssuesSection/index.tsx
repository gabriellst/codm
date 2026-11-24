import { useMemo, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { IconChevronRight } from '@tabler/icons-react'
import { getRouteApi, Link } from '@tanstack/react-router'
import { useGetNeedsYouPanel, useGetSessionIssues, useListArtifacts } from '@codm/client-typescript/typescript'
import type { GetSessionIssuesQueryResponse } from '@codm/client-typescript/typescript'
import { Board, BoardColumnBody } from '@codm/app-ui/board'
import { Empty, EmptyDescription, EmptyTitle } from '@codm/app-ui/empty'
import { KanbanColumn, KanbanColumnHeader } from '@codm/app-ui/kanban'
import { Skeleton } from '@codm/app-ui/skeleton'
import { TaskCard } from '@codm/app-ui/task-card'
import { useCardMeta } from '@/components/task/useCardMeta'
import { cardMetaOf } from '@/lib/task/cardMeta'
import { groupByTaskColumn, TASK_COLUMNS, type TaskColumn } from '@/lib/task/issueBoard'
import { cn } from '@/lib/utils'

const issuesRoute = getRouteApi('/(app)/threads/$threadId/issues/')

type Item = GetSessionIssuesQueryResponse['archived'][number]

/** The five columns of open work; "Concluída" joins them only when asked for (`done` in the URL). */
const OPEN_COLUMNS = TASK_COLUMNS.filter(column => column !== 'done')

/**
 * The conversation's tasks as a KANBAN by where each one stands right now (P2 — `.specs/2026-11-24-tarefa-e-
 * painel-design.md` §4; screen unfrozen by decision 2): the same six columns as the cloud panel, the finished
 * ones behind a link. Each card says what matters in its column — the open decision, when it comes back, why
 * it stopped, what it produced.
 */
export function SessionIssuesSection({ threadId, className, ...props }: ComponentProps<'div'> & { threadId: string }) {
	const { t } = useTranslation()
	const { done } = issuesRoute.useSearch()
	const { data, isLoading } = useGetSessionIssues(threadId)

	const active = useMemo(() => (data?.groups ?? []).flatMap(group => group.items), [data])
	const byColumn = useMemo(() => groupByTaskColumn(active), [active])

	if (isLoading || !data) {
		return (
			<div className={cn('flex flex-col gap-4 py-4', className)} {...props}>
				<Skeleton className="h-4 w-56" />
				<Skeleton className="h-64 rounded-asymmetric-md" />
			</div>
		)
	}

	const count = (column: TaskColumn) => byColumn.get(column)?.length ?? 0
	const finished = [...(byColumn.get('done') ?? []), ...data.archived]
	const columns = done ? TASK_COLUMNS : OPEN_COLUMNS
	const empty = active.length === 0 && data.archived.length === 0

	return (
		<div className={cn('flex h-full flex-col gap-3.5 py-2', className)} {...props}>
			<div className="flex items-center justify-between gap-3">
				<p className="text-[13px] text-muted-foreground">
					{t('task.board.summary', {
						needsYou: count('needsYou'),
						working: count('working'),
						waiting: count('waiting'),
						stalled: count('stalled'),
						queued: count('queued'),
					})}
				</p>
				<Link
					to="/threads/$threadId/issues"
					params={{ threadId }}
					search={{ done: !done }}
					className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-muted-foreground hover:text-foreground"
				>
					{done ? t('task.board.hideDone') : t('task.board.showDone', { count: finished.length })}
					<IconChevronRight className="size-3.5" />
				</Link>
			</div>

			{empty ? (
				<Empty>
					<EmptyTitle>{t('session.issuesEmptyTitle')}</EmptyTitle>
					<EmptyDescription>{t('session.issuesEmptyDescription')}</EmptyDescription>
				</Empty>
			) : (
				<Board data-testid="task-board" className="min-h-0 flex-1 items-stretch">
					{columns.map(column => (
						<KanbanColumn key={column} data-column={column} className="md:min-w-0">
							<KanbanColumnHeader
								tone={column}
								emphasis={column === 'needsYou'}
								title={t(`task.columns.${column}`)}
								count={column === 'done' ? finished.length : count(column)}
							/>
							<BoardColumnBody>
								{(column === 'done' ? finished : (byColumn.get(column) ?? [])).map(item => (
									<SessionTaskCard key={item.issueId} threadId={threadId} item={item} />
								))}
							</BoardColumnBody>
						</KanbanColumn>
					))}
				</Board>
			)}

			{/* The copy lives here, not on the wire — the daemon used to ship this sentence in English (D5). */}
			<p className="text-xs text-caption-foreground">{t('session.autoArchiveNote')}</p>
		</div>
	)
}

/** One task on the board — a link to its page, its bottom line chosen by its column. */
function SessionTaskCard({
	threadId,
	item,
	className,
	...props
}: Omit<ComponentProps<typeof TaskCard>, 'taskKey' | 'title'> & { threadId: string; item: Item }) {
	const { data: needsYou } = useGetNeedsYouPanel(threadId)
	const { data: artifacts } = useListArtifacts(threadId)
	const openAsks = (needsYou?.stops ?? []).flatMap(stop => (stop.issueId === item.issueId && stop.ask ? [stop.ask] : []))
	const artifactCount = (artifacts?.artifacts ?? []).filter(artifact => artifact.issueId === item.issueId).length
	const metaProps = useCardMeta(cardMetaOf({ ...item, openAsks, artifactCount }))
	return (
		<TaskCard
			data-testid="task-card"
			size="compact"
			taskKey={item.key}
			title={item.title}
			className={className}
			render={<Link to="/threads/$threadId/issues/$issueId" params={{ threadId, issueId: item.issueId }} />}
			{...metaProps}
			{...props}
		/>
	)
}
