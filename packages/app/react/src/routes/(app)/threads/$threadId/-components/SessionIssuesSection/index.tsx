import { useTranslation } from 'react-i18next'
import { useGetSessionIssues } from '@codedm/client-typescript/typescript'
import type { IssueStatus } from '@codedm/client-typescript/typescript'
import { IssueRow } from '@/components/console/IssueRow'
import { enumLabel } from '@/lib'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty'

const STATUS_ORDER: IssueStatus[] = ['NEEDS_INPUT', 'WORKING', 'COMPLETED']

/** Issues of one thread grouped by status, with the auto-archive note (T11). */
export function SessionIssuesSection({ threadId }: { threadId: string }) {
	const { t } = useTranslation()
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
				{t('session.issuesStats', { awaiting: stats.awaitingInput, working: stats.working, completed: stats.completed })}
			</p>

			{empty ? (
				<Empty>
					<EmptyTitle>{t('session.issuesEmptyTitle')}</EmptyTitle>
					<EmptyDescription>{t('session.issuesEmptyDescription')}</EmptyDescription>
				</Empty>
			) : (
				<div className="flex flex-col gap-8">
					{orderedGroups.map(group => (
						<section key={group.status} className="flex flex-col gap-1">
							<h2 className="label-eyebrow px-2 pb-1">{enumLabel('IssueStatus', group.status)}</h2>
							{group.items.map(item => (
								<IssueRow key={item.issueId} item={{ ...item, threadId }} />
							))}
						</section>
					))}

					{data.archived.length > 0 && (
						<section className="flex flex-col gap-1">
							<h2 className="label-eyebrow px-2 pb-1">{t('session.archived')}</h2>
							{data.archived.map(item => (
								<IssueRow key={item.issueId} item={{ ...item, threadId }} />
							))}
						</section>
					)}
				</div>
			)}

			{/* The copy lives here, not on the wire — the daemon used to ship this sentence in English (D5). */}
			<p className="text-xs text-caption-foreground">{t('session.autoArchiveNote')}</p>
		</div>
	)
}
