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
	STOP_RAISED: ({ item }) => <StopRaisedDetail item={item} />,
	STOP_RESOLVED: ({ item }) => <StopResolvedDetail item={item} />,
	COMPLETED: () => null,
	ARCHIVED: () => null,
	PAUSED: ({ item }) => <ControlDetail item={item} />,
	RESUMED: ({ item }) => <ControlDetail item={item} />,
	REGRET_WINDOW: ({ item }) => <RegretWindowDetail item={item} />,
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

type ClassificationMethod = (typeof ClassificationMethodEnum)[keyof typeof ClassificationMethodEnum]

/**
 * HOW a person's message reached this issue, for the routings worth naming: a quote (the rule layer) or
 * the parallel triage (fase 2 — `CONTEXT_MATCH`). Dispatched by the classification, never an `if` chain;
 * a new member fails compilation here until somebody says whether it gets a label.
 */
const ROUTED_BY: Readonly<Record<ClassificationMethod, 'session.timelineReplyQuote' | 'session.timelineTriage' | undefined>> = {
	[ClassificationMethodEnum.REPLY_QUOTE]: 'session.timelineReplyQuote',
	[ClassificationMethodEnum.CONTEXT_MATCH]: 'session.timelineTriage',
	[ClassificationMethodEnum.NEW_ISSUE]: undefined,
	[ClassificationMethodEnum.CLARIFIED]: undefined,
}

function MessageDetail({ item }: { item: ItemOf<'MESSAGE'> }) {
	const { t } = useTranslation()
	const fromPerson = item.transcriptKind === TranscriptKindEnum.CONTACT
	const routedBy = item.classification ? ROUTED_BY[item.classification] : undefined
	return (
		<>
			<span className="mr-1.5 text-xs text-foreground">
				{fromPerson ? t('session.timelineFromPerson') : t('session.timelineFromAgent')}
				{routedBy && ` · ${t(routedBy)}`}
				{/* Fase 3 — where what the issue said went: the group, a digest, or only the panel. */}
				{item.routing && ` · ${enumLabel('OutputRouting', item.routing)}`}
			</span>
			{item.text}
		</>
	)
}

/** The stop, and — when it is an ask (fase 3) — its code, question and options. */
function StopRaisedDetail({ item }: { item: ItemOf<'STOP_RAISED'> }) {
	const { t } = useTranslation()
	const locale = useLocale()
	if (!item.ask) return <>{`${enumLabel('StopKind', item.stopKind)} · ${item.title}`}</>
	return (
		<>
			<span className="mr-1.5 font-mono text-xs text-foreground">{item.ask.code}</span>
			{item.ask.question}
			{item.ask.options.length > 0 && <span className="block text-xs">{item.ask.options.map(option => option.label).join(' · ')}</span>}
			{item.ask.dueAt && (
				<span className="block text-xs">{t('session.ask.dueAt', { time: formatDayAndTime(item.ask.dueAt, locale) })}</span>
			)}
		</>
	)
}

/** How the stop was resolved — and, for an ask (fase 3), what was answered or the default it went on with. */
function StopResolvedDetail({ item }: { item: ItemOf<'STOP_RESOLVED'> }) {
	const resolution = enumLabel('StopResolution', item.resolution)
	return <>{item.answer ? `${resolution} · ${enumLabel('AskAnswerKind', item.answer.kind)}: ${item.answer.label}` : resolution}</>
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

/** Who held / released the work and from where (fase 2, item 2) — the source alone when no name was recorded. */
function ControlDetail({ item }: { item: ItemOf<'PAUSED'> | ItemOf<'RESUMED'> }) {
	const { t } = useTranslation()
	const source = enumLabel('IssueControlSource', item.source)
	return <>{item.by ? t('session.timelineControlBy', { source, by: item.by }) : source}</>
}

/** "esperou 20 s antes de git push — seguiu / cancelado por recado" (fase 2, item 3). */
function RegretWindowDetail({ item }: { item: ItemOf<'REGRET_WINDOW'> }) {
	const { t } = useTranslation()
	const action = enumLabel('IrreversibleActionKind', item.actionKind)
	const outcome = enumLabel('RegretWindowOutcome', item.outcome)
	return (
		<>
			{item.waitedMs > 0
				? t('session.timelineRegretWindow', { seconds: Math.round(item.waitedMs / 1000), action, outcome })
				: t('session.timelineRegretWindowNoWait', { action, outcome })}
		</>
	)
}
