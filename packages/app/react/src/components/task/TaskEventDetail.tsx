import { useState, type ComponentProps, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ClassificationMethodEnum, TranscriptKindEnum, useGetPublishRunOutput } from '@codm/client-typescript/typescript'
import type { IssueTimelineItemKind } from '@codm/client-typescript/typescript'
import { Button } from '@codm/app-ui/button'
import { Skeleton } from '@codm/app-ui/skeleton'
import { useLocale } from '@/hooks/useLocale'
import { enumLabel } from '@/lib/enums'
import { formatDayAndTime } from '@/lib/format'
import type { TimelineItem } from '@/lib/task/taskConversation'
import { cn } from '@/lib/utils'

type ItemOf<K extends IssueTimelineItemKind> = Extract<TimelineItem, { kind: K }>

/**
 * What a surface can offer beyond the words — the desktop has both, the cloud panel neither:
 * - `issueId` + `publishOutput`: a publish run's line gets "ver saída" (the output is read from the daemon).
 * - `renderBatchLink`: the batch line becomes a link (the desktop routes to the batch screen).
 */
export interface EventDetailCapabilities {
	issueId?: string
	publishOutput?: boolean
	renderBatchLink?: (item: ItemOf<'BATCH_LINKED'>, label: string) => ReactNode
}

interface DetailProps<K extends IssueTimelineItemKind> extends EventDetailCapabilities {
	item: ItemOf<K>
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
	BATCH_LINKED: props => <BatchLinkedDetail {...props} />,
	PUBLISH_RAN: props => <PublishRanDetail {...props} />,
	// Fase 5 — the nudge ("empurrão 1 de 2"), the scheduled retry and what the supervisor did, with why it looked.
	NUDGED: ({ item }) => <NudgedDetail item={item} />,
	RETRY_SCHEDULED: ({ item }) => <RetryScheduledDetail item={item} />,
	SUPERVISOR_REVIEWED: ({ item }) => <SupervisorReviewedDetail item={item} />,
}

/**
 * The words of one timeline item — shared by the timeline list, the desktop task conversation and the
 * cloud panel, so a kind is described once.
 */
export function TaskEventDetail({ item, ...capabilities }: { item: TimelineItem } & EventDetailCapabilities) {
	// TS cannot correlate `DETAIL[item.kind]` with `item` across a union, so the lookup is widened once here;
	// `DETAIL`'s own type is what keeps each renderer honest.
	const Detail = DETAIL[item.kind] as (props: { item: TimelineItem } & EventDetailCapabilities) => ReactNode
	return <Detail item={item} {...capabilities} />
}

function NudgedDetail({ item }: { item: ItemOf<'NUDGED'> }) {
	const { t } = useTranslation()
	return <>{t('session.timelineNudged', { ordinal: item.ordinal, outOf: item.outOf, source: enumLabel('NudgeSource', item.source) })}</>
}

/** "o supervisor escalou · motivo: parada há tempo" — only an ACTED verdict reaches the timeline (observation is audit). */
function SupervisorReviewedDetail({ item }: { item: ItemOf<'SUPERVISOR_REVIEWED'> }) {
	const { t } = useTranslation()
	return (
		<>
			{t('session.timelineSupervisor', {
				verdict: enumLabel('SupervisorVerdict', item.verdict),
				reason: enumLabel('SuspicionReason', item.reason),
			})}
		</>
	)
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
	const status = useSteerStatus(item)
	return (
		<>
			{item.reminder && <span className="mr-1.5 text-xs text-foreground">{t('session.steerAutoReminder')}</span>}
			{item.text}
			<span className="block text-xs">{status}</span>
		</>
	)
}

/** Where a steer stands — read, delivered, or only sent — with when. */
export function useSteerStatus(item: Pick<ItemOf<'STEER'>, 'at' | 'deliveredAt' | 'readAt'>): string {
	const { t } = useTranslation()
	const locale = useLocale()
	const when = (iso: string) => formatDayAndTime(iso, locale)
	if (item.readAt) return t('session.steerRead', { when: when(item.readAt) })
	if (item.deliveredAt) return t('session.steerDelivered', { when: when(item.deliveredAt) })
	return t('session.steerSent', { when: when(item.at) })
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

/** "L-31 · item 4" — which item of which batch was sent to this issue (fase 4, item 5); a link where the surface has one. */
function BatchLinkedDetail({ item, renderBatchLink }: DetailProps<'BATCH_LINKED'>) {
	const { t } = useTranslation()
	const label = t('session.timelineBatchLinked', { code: item.batchCode, n: item.n })
	return <>{renderBatchLink ? renderBatchLink(item, label) : label}</>
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
 *  "ver saída" opens what the run printed — fetched only once opened, and only where the surface reads the daemon. */
function PublishRanDetail({ item, issueId, publishOutput }: DetailProps<'PUBLISH_RAN'>) {
	const { t } = useTranslation()
	// Private disclosure of this row — truly local transient UI (state placement, case 5).
	const [open, setOpen] = useState(false)
	const outcome = enumLabel('PublishRunOutcome', item.outcome)
	const line = publishRanLine(t, outcome, item.durationMs, item.exitCode)
	if (!publishOutput || !issueId) return <>{line}</>
	return (
		<>
			{line}
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
