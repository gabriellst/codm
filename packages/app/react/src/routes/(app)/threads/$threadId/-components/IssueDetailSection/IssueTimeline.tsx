import { useState, type ComponentProps, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { getRouteApi, Link } from '@tanstack/react-router'
import {
	useGetIssueTimeline,
	useGetPublishRunOutput,
	ClassificationMethodEnum,
	TranscriptKindEnum,
} from '@codm/client-typescript/typescript'
import type { GetIssueTimelineQueryResponse, IssueTimelineItemKind } from '@codm/client-typescript/typescript'
import { Button } from '@codm/app-ui/button'
import { Skeleton } from '@codm/app-ui/skeleton'
import { useLocale } from '@/hooks'
import { enumLabel } from '@/lib'
import { formatDayAndTime } from '@/lib/format'
import { cn } from '@/lib/utils'

const threadRoute = getRouteApi('/(app)/threads/$threadId')

type Item = GetIssueTimelineQueryResponse['items'][number]
type ItemOf<K extends IssueTimelineItemKind> = Extract<Item, { kind: K }>

/** What every detail renderer receives: its own member of the union, and the issue it belongs to (a publish
 *  run's output is addressed by issue + timeline item). */
interface DetailProps<K extends IssueTimelineItemKind> {
	item: ItemOf<K>
	issueId: string
}

/** The detail line of each kind. One renderer per member of the union — never a chain on `kind` (CMP-P18). */
const DETAIL: { [K in IssueTimelineItemKind]: (props: DetailProps<K>) => ReactNode } = {
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
	BATCH_LINKED: ({ item }) => <BatchLinkedDetail item={item} />,
	PUBLISH_RAN: ({ item, issueId }) => <PublishRanDetail item={item} issueId={issueId} />,
	// Fase 5 — the nudge, the scheduled retry and what the supervisor did (minimal text; S6 refines).
	NUDGED: ({ item }) => <NudgedDetail item={item} />,
	RETRY_SCHEDULED: ({ item }) => <RetryScheduledDetail item={item} />,
	SUPERVISOR_REVIEWED: ({ item }) => `${enumLabel('SuspicionReason', item.reason)} → ${enumLabel('SupervisorVerdict', item.verdict)}`,
}

function NudgedDetail({ item }: { item: ItemOf<'NUDGED'> }) {
	const { t } = useTranslation()
	return <>{t('session.timelineNudged', { ordinal: item.ordinal, source: enumLabel('NudgeSource', item.source) })}</>
}

function RetryScheduledDetail({ item }: { item: ItemOf<'RETRY_SCHEDULED'> }) {
	const { t } = useTranslation()
	const locale = useLocale()
	return (
		<>
			{t('session.timelineRetryScheduled', {
				attempt: item.attempt,
				max: item.maxAttempts,
				time: formatDayAndTime(item.retryAt, locale),
			})}
		</>
	)
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
						<TimelineRow key={item.id} item={item} issueId={issueId} />
					))}
				</ol>
			)}
		</section>
	)
}

function TimelineRow({ item, issueId, className, ...props }: ComponentProps<'li'> & { item: Item; issueId: string }) {
	const locale = useLocale()
	// The renderer for THIS member. TS cannot correlate `DETAIL[item.kind]` with `item` across a union,
	// so the lookup is widened once here; `DETAIL`'s own type is what keeps each renderer honest.
	const Detail = DETAIL[item.kind] as (props: { item: Item; issueId: string }) => ReactNode
	return (
		<li className={cn('flex items-start gap-3 rounded-asymmetric-sm bg-background p-3', className)} {...props}>
			<span className="w-24 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{formatDayAndTime(item.at, locale)}</span>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="text-xs font-semibold text-foreground">{enumLabel('IssueTimelineItemKind', item.kind)}</span>
				<div className="min-w-0 whitespace-pre-wrap break-words text-sm text-muted-foreground">
					<Detail item={item} issueId={issueId} />
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

/** "L-31 · item 4" — which item of which batch was sent to this issue (fase 4, item 5), linking to the batch screen. */
function BatchLinkedDetail({ item, className }: { item: ItemOf<'BATCH_LINKED'> } & Pick<ComponentProps<typeof Link>, 'className'>) {
	const { t } = useTranslation()
	const { threadId } = threadRoute.useParams()
	return (
		<Link
			to="/threads/$threadId/batches/$batchCode"
			params={{ threadId, batchCode: item.batchCode }}
			className={cn('underline-offset-4 hover:underline', className)}
		>
			{t('session.timelineBatchLinked', { code: item.batchCode, n: item.n })}
		</Link>
	)
}

/** The run's line: with no duration nobody saw it end (`UNKNOWN`, the daemon stopped mid-run) — it asks for a check. */
function publishRanLine(
	t: ReturnType<typeof useTranslation>['t'],
	outcome: string,
	durationMs: number | undefined,
	exitCode: number | undefined,
): string {
	if (durationMs === undefined) return t('session.timelinePublishRanUnseen', { outcome })
	const seconds = Math.round(durationMs / 1000)
	return exitCode === undefined
		? t('session.timelinePublishRan', { outcome, seconds })
		: t('session.timelinePublishRanExit', { outcome, seconds, exitCode })
}

/** How the workspace's publish command ended (fase 4, item 6c) — outcome, exit code, duration; never the command.
 *  "ver saída" opens what the run printed — fetched only once opened. */
function PublishRanDetail({ item, issueId }: DetailProps<'PUBLISH_RAN'>) {
	const { t } = useTranslation()
	// Private disclosure of this row — truly local transient UI (state placement, case 5).
	const [open, setOpen] = useState(false)
	const outcome = enumLabel('PublishRunOutcome', item.outcome)
	return (
		<>
			{publishRanLine(t, outcome, item.durationMs, item.exitCode)}
			<Button
				type="button"
				variant="link"
				size="xs"
				className="ml-1.5 h-auto p-0"
				aria-expanded={open}
				onClick={() => setOpen(value => !value)}
			>
				{open ? t('session.timelinePublishOutputHide') : t('session.timelinePublishOutputShow')}
			</Button>
			{open && <PublishRunOutput issueId={issueId} timelineItemId={item.id} className="mt-2" />}
		</>
	)
}

/** The run's output lines (the terminal-log rows addressed by this timeline item), in a monospace block. */
function PublishRunOutput({
	issueId,
	timelineItemId,
	className,
	...props
}: ComponentProps<'pre'> & { issueId: string; timelineItemId: string }) {
	const { t } = useTranslation()
	const { data, isLoading } = useGetPublishRunOutput(issueId, timelineItemId)
	if (isLoading || !data) return <Skeleton className={cn('h-16 rounded-asymmetric-sm', className)} />
	if (data.lines.length === 0) return <span className={cn('block text-xs', className)}>{t('session.timelinePublishOutputEmpty')}</span>
	return (
		<pre
			className={cn(
				'max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-asymmetric-sm bg-muted p-3 font-mono text-xs text-foreground',
				className,
			)}
			{...props}
		>
			{data.lines.map(line => line.line).join('\n')}
		</pre>
	)
}
