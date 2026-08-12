import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { getRouteApi, Link } from '@tanstack/react-router'
import { IconChecklist } from '@tabler/icons-react'
import { useGetIssuesOverview } from '@codm/client-typescript/typescript'
import type { IssueStatus } from '@codm/client-typescript/typescript'
import { PageHeader } from '@/components/console/PageHeader'
import { IssueRow } from '@/components/console/IssueRow'
import { enumLabel } from '@/lib'
import { cn } from '@/lib/utils'
import { sectionLabelBare } from '@/components/ui/surfaces'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'

const routeApi = getRouteApi('/(app)/issues/')

const STATUS_ORDER: IssueStatus[] = ['NEEDS_INPUT', 'WORKING', 'COMPLETED']

/** Every issue across every thread, grouped by status, with an archived reveal (T04). */
export function IssuesOverviewSection({ className, ...props }: ComponentProps<'div'>) {
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
		<div className={cn('mx-auto flex w-full flex-col gap-8 px-6 pb-16 pt-20', className)} {...props}>
			{/* D3 — the stats line left the PageHeader subtitle slot and became the BODY's first
			    line (the header keeps a subtitle only on Home). It still loads with the page shape:
			    the skeleton keeps this row's height so the groups below don't jump. */}
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
				<div className="flex flex-col gap-4">
					<Skeleton className="h-16 rounded-2xl" />
					<Skeleton className="h-16 rounded-2xl" />
					<Skeleton className="h-16 rounded-2xl" />
				</div>
			) : orderedGroups.length === 0 && (!data || data.archived.length === 0) ? (
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
					{orderedGroups.map(group => (
						<section key={group.status} className="flex flex-col gap-2">
							<h2 className={sectionLabelBare}>{enumLabel('IssueStatus', group.status)}</h2>
							{group.items.map(item => (
								<IssueRow key={item.issueId} item={item} />
							))}
						</section>
					))}

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
