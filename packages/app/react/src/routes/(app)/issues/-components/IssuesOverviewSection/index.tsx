import { getRouteApi, Link } from '@tanstack/react-router'
import { useGetIssuesOverview } from '@codedm/client-typescript/typescript'
import type { IssueStatus } from '@codedm/client-typescript/typescript'
import { PageHeader } from '@/components/console/PageHeader'
import { IssueRow } from '@/components/console/IssueRow'
import { issueGroupLabel } from '@/components/console/glyphs'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty'

const routeApi = getRouteApi('/(app)/issues/')

const STATUS_ORDER: IssueStatus[] = ['NEEDS_INPUT', 'WORKING', 'COMPLETED']

/** Every issue across every thread, grouped by status, with an archived reveal (T04). */
export function IssuesOverviewSection() {
	const { archived } = routeApi.useSearch()
	const { data, isLoading } = useGetIssuesOverview({ includeArchived: archived })

	const stats = data?.statsLine
	const subtitle = stats
		? `${stats.awaitingInput} awaiting input · ${stats.working} working · ${stats.completed} completed · ${stats.archived} archived`
		: undefined

	const orderedGroups = STATUS_ORDER.map(status => data?.groups.find(g => g.status === status)).filter(
		(g): g is NonNullable<typeof g> => !!g && g.items.length > 0,
	)

	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 pb-16 pt-20">
			<PageHeader
				title="Issues"
				subtitle={subtitle ?? <Skeleton className="h-4 w-64" />}
				action={
					<Button variant={archived ? 'secondary' : 'outline'} size="sm" render={<Link to="/issues" search={{ archived: !archived }} />}>
						{String(archived ? 'Hide archived' : 'Show archived')}
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
					<EmptyTitle>No issues yet</EmptyTitle>
					<EmptyDescription>Issues appear here once your agents start working on routed messages.</EmptyDescription>
				</Empty>
			) : (
				<div className="flex flex-col gap-8">
					{orderedGroups.map(group => (
						<section key={group.status} className="flex flex-col gap-1">
							<h2 className="label-eyebrow px-2 pb-1">{issueGroupLabel[group.status]}</h2>
							{group.items.map(item => (
								<IssueRow key={item.issueId} item={item} />
							))}
						</section>
					))}

					{archived && data && data.archived.length > 0 && (
						<section className="flex flex-col gap-1">
							<h2 className="label-eyebrow px-2 pb-1">Archived</h2>
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
