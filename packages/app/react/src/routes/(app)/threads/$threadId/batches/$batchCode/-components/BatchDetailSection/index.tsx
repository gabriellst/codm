import type * as React from 'react'
import { useTranslation } from 'react-i18next'
import { getRouteApi, Link } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { BatchItemDestinationKindEnum, BatchStatusEnum, getBatchQueryKey, useGetBatch } from '@codm/client-typescript/typescript'
import type { BatchItemDestination, BatchItemDestinationKind, BatchStatus, GetBatchQueryResponse } from '@codm/client-typescript/typescript'
import { Badge } from '@codm/app-ui/badge'
import { Skeleton } from '@codm/app-ui/skeleton'
import { useServerEvents } from '@/hooks'
import { enumLabel } from '@/lib'
import { cn } from '@/lib/utils'

const routeApi = getRouteApi('/(app)/threads/$threadId/batches/$batchCode/')

type Batch = GetBatchQueryResponse
type BatchItem = Batch['items'][number]
type IssueRef = Batch['issues'][number]

/** How each status is drawn — a style map, total over the contract's statuses. */
const STATUS_BADGE: Record<BatchStatus, 'warning' | 'success'> = {
	[BatchStatusEnum.INCOMPLETE]: 'warning',
	[BatchStatusEnum.RECORDED]: 'success',
}

/** The fields a destination may carry — read by `in`, the destination's own kind decides which apply. */
const issueIdOf = (destination: BatchItemDestination): string | undefined => ('issueId' in destination ? destination.issueId : undefined)
const reasonOf = (destination: BatchItemDestination): string | undefined =>
	'reason' in destination ? destination.reason : 'note' in destination ? destination.note : undefined

/** What each destination shows besides its label (Non-Negotiable 3 / CMP-P18): dispatch by its kind, never an `if` chain. */
const DESTINATION_DETAIL: Record<
	BatchItemDestinationKind,
	React.ComponentType<{ destination: BatchItemDestination; issues: IssueRef[] }>
> = {
	[BatchItemDestinationKindEnum.NEW_ISSUE]: IssueLink,
	[BatchItemDestinationKindEnum.ATTACHED]: IssueLink,
	[BatchItemDestinationKindEnum.NEEDS_DECISION]: IssueLink,
	[BatchItemDestinationKindEnum.ALREADY_LIVE]: IssueLinkAndReason,
	[BatchItemDestinationKindEnum.DECLINED]: Reason,
	[BatchItemDestinationKindEnum.DEFERRED]: Reason,
}

/** The facts after which a batch may have its destinations: the orchestrator replied, an issue was born. */
const BATCH_EVENTS = ['integration.orchestrator.replied', 'integration.issue.created'] as const

/**
 * THE BATCH SCREEN (fase 4, item 5) — the items a message listed, each with where it went and the task it went to.
 * An incomplete batch shows its items without destinations: the orchestrator has not recorded them yet.
 */
export function BatchDetailSection({ className, ...props }: React.ComponentProps<'section'>) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const { threadId, batchCode } = routeApi.useParams()
	const { data } = useGetBatch(threadId, batchCode)

	useServerEvents([...BATCH_EVENTS], () => {
		queryClient.invalidateQueries({ queryKey: getBatchQueryKey(threadId, batchCode) })
	})

	if (data === undefined) {
		return (
			<div className="flex flex-col gap-2">
				<Skeleton className="h-8 w-48" />
				<Skeleton className="h-32 w-full" />
			</div>
		)
	}

	return (
		<section className={cn('flex flex-col gap-4', className)} {...props}>
			<header className="flex flex-col gap-1">
				<div className="flex items-center gap-3">
					<h1 className="text-2xl font-bold text-foreground">{t('batchDetail.title', { code: data.code })}</h1>
					<Badge variant={STATUS_BADGE[data.status]}>{enumLabel('BatchStatus', data.status)}</Badge>
				</div>
				<p className="text-sm text-muted-foreground">{t('batchDetail.subtitle', { count: data.items.length })}</p>
			</header>
			<ol className="flex flex-col gap-2">
				{data.items.map(item => (
					<BatchItemRow key={item.n} item={item} issues={data.issues} />
				))}
			</ol>
		</section>
	)
}

interface BatchItemRowProps extends React.ComponentProps<'li'> {
	item: BatchItem
	issues: IssueRef[]
}

/** One listed item: its number, its words, and where it went (or that it has no destination yet). */
function BatchItemRow({ item, issues, className, ...props }: BatchItemRowProps) {
	const { t } = useTranslation()
	const Detail = item.destination ? DESTINATION_DETAIL[item.destination.kind] : undefined
	return (
		<li className={cn('flex flex-col gap-1 rounded-2xl border border-border px-4 py-3', className)} data-item={item.n} {...props}>
			<div className="flex items-center gap-2 text-sm">
				<span className="font-mono font-semibold">{item.n}</span>
				<span className="text-muted-foreground">
					{item.destination ? enumLabel('BatchItemDestinationKind', item.destination.kind) : t('batchDetail.noDestination')}
				</span>
			</div>
			<p className="text-sm">{item.excerpt}</p>
			{item.destination && Detail && <Detail destination={item.destination} issues={issues} />}
		</li>
	)
}

/** The task a destination names — a link when the console already knows it (a task forked this turn may not be yet). */
function IssueLink({
	destination,
	issues,
	className,
}: { destination: BatchItemDestination; issues: IssueRef[] } & Pick<React.ComponentProps<typeof Link>, 'className'>) {
	const { threadId } = routeApi.useParams()
	const issue = issues.find(candidate => candidate.issueId === issueIdOf(destination))
	if (!issue) return null
	return (
		<Link
			to="/threads/$threadId/issues/$issueId"
			params={{ threadId, issueId: issue.issueId }}
			className={cn('text-sm text-foreground underline-offset-4 hover:underline', className)}
		>
			<span className="font-mono">{issue.key}</span> {issue.title}
		</Link>
	)
}

/** Why the item went nowhere (or later) — the words the orchestrator recorded. */
function Reason({ destination }: { destination: BatchItemDestination; issues: IssueRef[] }) {
	const reason = reasonOf(destination)
	return reason ? <p className="text-sm text-muted-foreground">{reason}</p> : null
}

/** Already live: the task it lives in, when named, and the note. */
function IssueLinkAndReason(props: { destination: BatchItemDestination; issues: IssueRef[] }) {
	return (
		<>
			<IssueLink {...props} />
			<Reason {...props} />
		</>
	)
}
