import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { IconChecklist } from '@tabler/icons-react'
import { getIssuesOverviewQueryKey, IssueLifeStateEnum, useGetIssuesOverview } from '@codm/client-typescript/typescript'
import type { GetIssuesOverviewQueryResponse, IssueLifeState } from '@codm/client-typescript/typescript'
import { PageHeader } from '@/components/console/PageHeader'
import { IssueRow } from '@/components/console/IssueRow'
import { IssueCard } from '@/components/console/IssueCard'
import { useServerEvents } from '@/hooks'
import { enumLabel } from '@/lib'
import { cn } from '@/lib/utils'
import { sectionLabelBare } from '@codm/app-ui/surfaces'
import { Skeleton } from '@codm/app-ui/skeleton'
import { Button } from '@codm/app-ui/button'
import { Board, BoardColumn, BoardColumnBody, BoardColumnHeader } from '@codm/app-ui/board'
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@codm/app-ui/empty'

const routeApi = getRouteApi('/(app)/issues/')

type Item = GetIssuesOverviewQueryResponse['groups'][number]['items'][number]

/**
 * The BOARD's columns, in reading order (fase 1): what is waiting to start, what is running, what waits
 * on someone, what waits on the usage limit, what stopped without saying why, what is done.
 */
const BOARD_COLUMNS = [
	IssueLifeStateEnum.QUEUED,
	IssueLifeStateEnum.RUNNING,
	IssueLifeStateEnum.WAITING_PERSON,
	IssueLifeStateEnum.WAITING_PROVIDER,
	IssueLifeStateEnum.STALLED,
	IssueLifeStateEnum.DONE,
] as const satisfies readonly IssueLifeState[]

/**
 * Which column each life state sits in. REMINDED shares STALLED's column — both are "it went quiet" —
 * and the card itself says "reminded". Exhaustive by type: a new life state fails `tsc` until placed.
 */
const COLUMN_OF: Record<IssueLifeState, (typeof BOARD_COLUMNS)[number]> = {
	[IssueLifeStateEnum.QUEUED]: IssueLifeStateEnum.QUEUED,
	[IssueLifeStateEnum.RUNNING]: IssueLifeStateEnum.RUNNING,
	[IssueLifeStateEnum.WAITING_PERSON]: IssueLifeStateEnum.WAITING_PERSON,
	[IssueLifeStateEnum.WAITING_PROVIDER]: IssueLifeStateEnum.WAITING_PROVIDER,
	[IssueLifeStateEnum.REMINDED]: IssueLifeStateEnum.STALLED,
	[IssueLifeStateEnum.STALLED]: IssueLifeStateEnum.STALLED,
	[IssueLifeStateEnum.DONE]: IssueLifeStateEnum.DONE,
}

/**
 * The integration facts that move a card between columns. A turn ENDING has no fact of its own; the next
 * fact (a result, a stop, a completion) refreshes the board.
 */
const BOARD_EVENTS = [
	'integration.issue.created',
	'integration.issue.opened',
	'integration.issue.completed',
	'integration.issue.archived',
	'integration.thread.stop_raised',
	'integration.thread.stop_resolved',
	'integration.orchestrator.replied',
] as const

/** Every issue across every thread, as a BOARD by where its work stands (fase 1), with an archived reveal. */
export function IssuesOverviewSection({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const { archived } = routeApi.useSearch()
	const { data, isLoading } = useGetIssuesOverview({ includeArchived: archived })

	useServerEvents([...BOARD_EVENTS], () => {
		queryClient.invalidateQueries({ queryKey: getIssuesOverviewQueryKey() })
	})

	const stats = data?.statsLine
	const subtitle = stats
		? t('issues.statsLine', {
				awaitingInput: stats.awaitingInput,
				working: stats.working,
				completed: stats.completed,
				archived: stats.archived,
			})
		: undefined

	const active: Item[] = data?.groups.flatMap(group => group.items) ?? []
	const byColumn = new Map<IssueLifeState, Item[]>(BOARD_COLUMNS.map(column => [column, []]))
	for (const item of active) byColumn.get(COLUMN_OF[item.lifeState])?.push(item)

	return (
		<div className={cn('mx-auto flex w-full flex-col gap-8 px-6 pb-16 pt-20', className)} {...props}>
			<div className="flex flex-col gap-2">
				<PageHeader
					title={t('issues.title')}
					action={
						// `nativeButton={false}` — this renders an <a>, not a <button>.
						<Button
							variant={archived ? 'secondary' : 'outline'}
							size="sm"
							nativeButton={false}
							render={<Link to="/issues" search={{ archived: !archived }} />}
						>
							{archived ? t('issues.hideArchived') : t('issues.showArchived')}
						</Button>
					}
				/>
				<div className="text-sm text-muted-foreground">{subtitle ?? <Skeleton className="h-4 w-64" />}</div>
			</div>

			{isLoading ? (
				<div className="flex gap-3">
					<Skeleton className="h-48 w-72 rounded-2xl" />
					<Skeleton className="h-48 w-72 rounded-2xl" />
					<Skeleton className="h-48 w-72 rounded-2xl" />
				</div>
			) : active.length === 0 && (!data || data.archived.length === 0) ? (
				<Empty className="border border-solid border-border bg-background">
					<EmptyMedia
						variant="icon"
						className="size-12 rounded-asymmetric-md bg-secondary text-secondary-foreground [&_svg:not([class*='size-'])]:size-6"
					>
						<IconChecklist />
					</EmptyMedia>
					<EmptyTitle className="text-base">{t('issues.emptyTitle')}</EmptyTitle>
					<EmptyDescription>{t('issues.emptyDescription')}</EmptyDescription>
				</Empty>
			) : (
				<div className="flex flex-col gap-8">
					<Board>
						{BOARD_COLUMNS.map(column => {
							const items = byColumn.get(column) ?? []
							return (
								<BoardColumn key={column} data-column={column}>
									<BoardColumnHeader title={enumLabel('IssueLifeState', column)} count={items.length} />
									<BoardColumnBody>
										{items.map(item => (
											<IssueCard key={item.issueId} item={item} />
										))}
									</BoardColumnBody>
								</BoardColumn>
							)
						})}
					</Board>

					{archived && data && data.archived.length > 0 && (
						<section className="flex flex-col gap-2">
							<h2 className={sectionLabelBare}>{t('issues.archived')}</h2>
							{data.archived.map(item => (
								<IssueRow key={item.issueId} item={item} />
							))}
						</section>
					)}
				</div>
			)}
		</div>
	)
}
