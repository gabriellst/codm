import { useGetSessionIssues } from '@codedm/client-typescript/typescript'
import type { IssueStatus } from '@codedm/client-typescript/typescript'
import { IssueRow } from '@/components/console/IssueRow'
import { issueGroupLabel } from '@/components/console/glyphs'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty'

const STATUS_ORDER: IssueStatus[] = ['NEEDS_INPUT', 'WORKING', 'COMPLETED']

/** Issues of one thread grouped by status, with the auto-archive note (T11). */
export function SessionIssuesSection({ threadId }: { threadId: string }) {
	const { data, isLoading } = useGetSessionIssues(threadId)

	if (isLoading || !data) {
		return (
			<div className="flex flex-col gap-4 py-4">
				<Skeleton className="h-4 w-56" />
				<Skeleton className="h-16 rounded-2xl" />
				<Skeleton className="h-16 rounded-2xl" />
			</div>
		)
	}

	const stats = data.statsLine
	const orderedGroups = STATUS_ORDER.map(status => data.groups.find(g => g.status === status)).filter(
		(g): g is NonNullable<typeof g> => !!g && g.items.length > 0,
	)
	const empty = orderedGroups.length === 0 && data.archived.length === 0

	return (
		<div className="flex flex-col gap-6 py-2">
			<p className="text-sm text-muted-foreground">
				{stats.awaitingInput} awaiting input · {stats.working} working · {stats.completed} completed
			</p>

			{empty ? (
				<Empty>
					<EmptyTitle>No issues in this thread</EmptyTitle>
					<EmptyDescription>Routed messages that spawn work will show up here as issues.</EmptyDescription>
				</Empty>
			) : (
				<div className="flex flex-col gap-8">
					{orderedGroups.map(group => (
						<section key={group.status} className="flex flex-col gap-1">
							<h2 className="label-eyebrow px-2 pb-1">{issueGroupLabel[group.status]}</h2>
							{group.items.map(item => (
								<IssueRow key={item.issueId} item={{ ...item, threadId }} />
							))}
						</section>
					))}

					{data.archived.length > 0 && (
						<section className="flex flex-col gap-1">
							<h2 className="label-eyebrow px-2 pb-1">Archived</h2>
							{data.archived.map(item => (
								<IssueRow key={item.issueId} item={{ ...item, threadId }} />
							))}
						</section>
					)}
				</div>
			)}

			<p className="text-xs text-muted-foreground">{data.autoArchiveNote}</p>
		</div>
	)
}
