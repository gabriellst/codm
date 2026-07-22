import { useTranslation } from 'react-i18next'
import { getRouteApi, Link } from '@tanstack/react-router'
import { useGetIssuesOverview } from '@codedm/client-typescript/typescript'
import type { IssueStatus } from '@codedm/client-typescript/typescript'
import { PageHeader } from '@/components/console/PageHeader'
import { IssueRow } from '@/components/console/IssueRow'
import { enumLabel } from '@/lib'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty'

const routeApi = getRouteApi('/(app)/issues/')

const STATUS_ORDER: IssueStatus[] = ['NEEDS_INPUT', 'WORKING', 'COMPLETED']

/** Every issue across every thread, grouped by status, with an archived reveal (T04). */
export function IssuesOverviewSection() {
	const { t } = useTranslation()
	const { archived } = routeApi.useSearch()
	const { data, isLoading } = useGetIssuesOverview({ includeArchived: archived })

	const stats = data?.statsLine
	const subtitle = stats
		? t('issues.statsLine', {
				awaitingInput: stats.awaitingInput,
				working: stats.working,
				completed: stats.completed,
				archived: stats.archived,
			})
		: undefined

	const orderedGroups = STATUS_ORDER.map(status => data?.groups.find(g => g.status === status)).filter(
		(g): g is NonNullable<typeof g> => !!g && g.items.length > 0,
	)

	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 pb-16 pt-20">
			<PageHeader
				title={t('issues.title')}
				subtitle={subtitle ?? <Skeleton className="h-4 w-64" />}
				action={
					<Button variant={archived ? 'secondary' : 'outline'} size="sm" render={<Link to="/issues" search={{ archived: !archived }} />}>
						{archived ? t('issues.hideArchived') : t('issues.showArchived')}
					</Button>
				}
			/>

			{isLoading ? (
				<div className="flex flex-col gap-4">
					<Skeleton className="h-16 rounded-2xl" />
					<Skeleton className="h-16 rounded-2xl" />
					<Skeleton className="h-16 rounded-2xl" />
				</div>
			) : orderedGroups.length === 0 && (!data || data.archived.length === 0) ? (
				<Empty>
					<EmptyTitle>{t('issues.emptyTitle')}</EmptyTitle>
					<EmptyDescription>{t('issues.emptyDescription')}</EmptyDescription>
				</Empty>
			) : (
				<div className="flex flex-col gap-8">
					{orderedGroups.map(group => (
						<section key={group.status} className="flex flex-col gap-1">
							<h2 className="label-eyebrow px-2 pb-1">{enumLabel('IssueStatus', group.status)}</h2>
							{group.items.map(item => (
								<IssueRow key={item.issueId} item={item} />
							))}
						</section>
					))}

					{archived && data && data.archived.length > 0 && (
						<section className="flex flex-col gap-1">
							<h2 className="label-eyebrow px-2 pb-1">{t('issues.archived')}</h2>
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
