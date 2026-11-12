import type { ComponentProps, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useGetIssueTimeline, ClassificationMethodEnum, TranscriptKindEnum } from '@codm/client-typescript/typescript'
import type { GetIssueTimelineQueryResponse, IssueTimelineItemKind } from '@codm/client-typescript/typescript'
import { Skeleton } from '@codm/app-ui/skeleton'
import { useLocale } from '@/hooks'
import { enumLabel } from '@/lib'
import { formatDayAndTime } from '@/lib/format'
import { cn } from '@/lib/utils'

type Item = GetIssueTimelineQueryResponse['items'][number]
type ItemOf<K extends IssueTimelineItemKind> = Extract<Item, { kind: K }>

/** The detail line of each kind. One renderer per member of the union — never a chain on `kind` (CMP-P18). */
const DETAIL: { [K in IssueTimelineItemKind]: (props: { item: ItemOf<K> }) => ReactNode } = {
	CREATED: ({ item }) => item.title,
	TURN_STARTED: () => null,
	MESSAGE: ({ item }) => <MessageDetail item={item} />,
	STEER: ({ item }) => <SteerDetail item={item} />,
	ARTIFACT: ({ item }) => `${enumLabel('ArtifactKind', item.artifactKind)} · ${item.name}`,
	STOP_RAISED: ({ item }) => `${enumLabel('StopKind', item.stopKind)} · ${item.title}`,
	STOP_RESOLVED: ({ item }) => enumLabel('StopResolution', item.resolution),
	COMPLETED: () => null,
	ARCHIVED: () => null,
}

/**
 * The issue's TIMELINE (fase 1, item 1): everything that happened to it, oldest first — created, each
 * turn, what was said about it and the replies that quoted it, each steer with where it stands, its
 * artifacts, its stops and their answers, and how it ended.
 */
export function IssueTimeline({ issueId, className, ...props }: ComponentProps<'section'> & { issueId: string }) {
	const { t } = useTranslation()
	const { data, isLoading } = useGetIssueTimeline(issueId)

	return (
		<section className={cn('flex flex-col gap-3', className)} {...props}>
			<h2 className="label-eyebrow">{t('session.timeline')}</h2>
			{isLoading || !data ? (
				<Skeleton className="h-24 rounded-2xl" />
			) : (
				<ol className="flex flex-col gap-2">
					{data.items.map(item => (
						<TimelineRow key={item.id} item={item} />
					))}
				</ol>
			)}
		</section>
	)
}

function TimelineRow({ item, className, ...props }: ComponentProps<'li'> & { item: Item }) {
	const locale = useLocale()
	// The renderer for THIS member. TS cannot correlate `DETAIL[item.kind]` with `item` across a union,
	// so the lookup is widened once here; `DETAIL`'s own type is what keeps each renderer honest.
	const Detail = DETAIL[item.kind] as (props: { item: Item }) => ReactNode
	return (
		<li className={cn('flex items-start gap-3 rounded-asymmetric-sm bg-background p-3', className)} {...props}>
			<span className="w-24 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{formatDayAndTime(item.at, locale)}</span>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="text-xs font-semibold text-foreground">{enumLabel('IssueTimelineItemKind', item.kind)}</span>
				<div className="min-w-0 whitespace-pre-wrap break-words text-sm text-muted-foreground">
					<Detail item={item} />
				</div>
			</div>
		</li>
	)
}

function MessageDetail({ item }: { item: ItemOf<'MESSAGE'> }) {
	const { t } = useTranslation()
	const fromPerson = item.transcriptKind === TranscriptKindEnum.CONTACT
	return (
		<>
			<span className="mr-1.5 text-xs text-foreground">
				{fromPerson ? t('session.timelineFromPerson') : t('session.timelineFromAgent')}
				{item.classification === ClassificationMethodEnum.REPLY_QUOTE && ` · ${t('session.timelineReplyQuote')}`}
			</span>
			{item.text}
		</>
	)
}

function SteerDetail({ item }: { item: ItemOf<'STEER'> }) {
	const { t } = useTranslation()
	const locale = useLocale()
	const when = (iso: string) => formatDayAndTime(iso, locale)
	const status = item.readAt
		? t('session.steerRead', { when: when(item.readAt) })
		: item.deliveredAt
			? t('session.steerDelivered', { when: when(item.deliveredAt) })
			: t('session.steerSent', { when: when(item.at) })
	return (
		<>
			{item.reminder && <span className="mr-1.5 text-xs text-foreground">{t('session.steerAutoReminder')}</span>}
			{item.text}
			<span className="block text-xs">{status}</span>
		</>
	)
}
