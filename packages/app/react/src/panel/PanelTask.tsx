import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { IconChevronLeft, IconPlayerPause, IconPlayerPlay } from '@tabler/icons-react'
import {
	ArtifactKindEnum,
	IssueLifeStateEnum,
	IssueTimelineItemKindEnum,
	PanelActionKindEnum,
	requestPanelActionMutationRequestSchema,
	useGetPanelBoard,
	useGetPanelIdentity,
	useGetPanelIssue,
	type GetPanelIssueQueryResponse,
} from '@codm/client-typescript/typescript-cloud'
import { ArtifactTile } from '@codm/app-ui/artifact-tile'
import { Button } from '@codm/app-ui/button'
import { Skeleton } from '@codm/app-ui/skeleton'
import { StatusPill } from '@codm/app-ui/status-pill'
import { SteerComposer } from '@codm/app-ui/steer-composer'
import { sectionLabel } from '@codm/app-ui/surfaces'
import { TaskConversation } from '@/components/task/TaskConversation'
import type { AskView } from '@/components/task/TaskSurface'
import { useLocale } from '@/hooks/useLocale'
import { enumLabel } from '@/lib/enums'
import { formatDayAndTime, formatRelativeTime, formatTimeOfDay } from '@/lib/format'
import { artifactGlyph } from '@/lib/task/artifactGlyph'
import { TASK_COLUMN_OF, type TaskColumn } from '@/lib/task/issueBoard'
import { batchOf, buildConversation, createdAt, retryCount, type OpenStop } from '@/lib/task/taskConversation'
import { pickUnionVariantField } from '@/lib/union'
import { cn } from '@/lib/utils'
import { useDialogStore } from '@/stores/useDialogStore'
import { IdentifyDialog } from './IdentifyDialog'
import { PanelActionStatus } from './PanelActionStatus'
import { GroupTitle, HealthLine, IdentityChip } from './PanelHeader'
import { PanelTaskCard } from './PanelTaskCard'
import { PanelTaskSurface } from './PanelTaskSurface'
import { clearHash, openHash } from './panelHash'
import { usePanelToken } from './panelToken'
import { usePanelAction, usePanelActionPending } from './usePanelAction'

type PanelIssue = GetPanelIssueQueryResponse
type Issue = PanelIssue['issue']
type Section = 'conversation' | 'artifacts'

/** The steer, validated by the cloud SDK's own STEER member (1–2000 characters) — never a hand-rolled rule. */
const steerTextSchema = pickUnionVariantField(requestPanelActionMutationRequestSchema, { kind: PanelActionKindEnum.STEER }, 'text')

/** The task list beside an open task: who needs a person first, then what moves, then the rest — a column
 *  added to the board fails to compile until it says where it ranks. */
const LIST_RANK: Record<TaskColumn, number> = { needsYou: 0, working: 1, waiting: 2, stalled: 3, queued: 4, done: 5 }

/**
 * ONE TASK, inside (N2/N3 phone, N5 wide — one tree, the cut is `lg`: three columns need ~1024 px; below that
 * the phone layout reads better than a squeezed conversation). Wide: the group's tasks on the left (the
 * open one selected), the conversation with the steer field in the middle, the artifacts and the details on the
 * right. Phone: the header, then "Conversa" / "Artefatos · N". Everything that acts goes through the panel's
 * surface port (`POST /actions` as whoever identified on this device).
 */
export function PanelTask({ issueId, className, ...props }: ComponentProps<'div'> & { issueId: string }) {
	const { t } = useTranslation()
	const token = usePanelToken()
	// RE-READ EVERY 15 s, the same mechanism as the board (spec 13/11, review L9): the panel has no event stream,
	// and what the agent says arrives in the cloud only on the daemon's next sync.
	const { data, isError } = useGetPanelIssue(token, issueId, { query: { refetchInterval: 15_000 } })
	// Which section the phone shows — truly local transient UI (state placement, case 5): the address is
	// reserved for WHAT is open (`#APP-12`, the link the group gets), and both sections are one task.
	const [section, setSection] = useState<Section>('conversation')

	return (
		<div
			className={cn(
				'grid min-h-full content-start lg:h-full lg:min-h-0 lg:content-stretch lg:grid-cols-[18rem_minmax(0,1fr)_19rem] xl:grid-cols-[21rem_minmax(0,1fr)_21rem]',
				className,
			)}
			{...props}
		>
			<TaskListColumn openIssueId={issueId} className="hidden lg:flex" />
			{isError ? (
				<NotOnPanel />
			) : !data ? (
				<div className="flex flex-col gap-4 p-4 lg:p-8">
					<Skeleton className="h-8 w-64" />
					<Skeleton className="h-48 rounded-asymmetric-md" />
				</div>
			) : (
				<PanelTaskSurface issue={data.issue}>
					<main className="flex min-w-0 flex-col lg:min-h-0 lg:border-x lg:border-border">
						<TaskTop issue={data.issue} className="px-4 pt-4 lg:px-8 lg:pt-7" />
						<nav aria-label={t('panel.task.sections')} className="flex gap-6 border-b border-border px-4 lg:hidden">
							<SectionTab current={section === 'conversation'} onClick={() => setSection('conversation')}>
								{t('task.conversation')}
							</SectionTab>
							<SectionTab current={section === 'artifacts'} onClick={() => setSection('artifacts')}>
								{t('task.artifactsCount', { count: artifactsOf(data).length })}
							</SectionTab>
						</nav>
						<TaskConversationColumn
							issue={data}
							className={cn('flex-1 lg:flex lg:min-h-0', section === 'conversation' ? 'flex' : 'hidden')}
						/>
					</main>
					<TaskSideColumn issue={data} className={cn('lg:flex lg:min-h-0', section === 'artifacts' ? 'flex' : 'hidden')} />
				</PanelTaskSurface>
			)}
		</div>
	)
}

function SectionTab({ current, className, ...props }: ComponentProps<'button'> & { current: boolean }) {
	return (
		<button
			type="button"
			aria-current={current || undefined}
			className={cn(
				'-mb-px cursor-pointer border-b-2 border-transparent py-2.5 text-base text-muted-foreground aria-current:border-primary aria-current:font-bold aria-current:text-foreground',
				className,
			)}
			{...props}
		/>
	)
}

/** When the board still lists the key but the task itself no longer answers. */
function NotOnPanel({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	return (
		<div className={cn('flex flex-col items-start gap-3 p-4 lg:p-8', className)} {...props}>
			<BackToBoard />
			<p className="text-sm text-muted-foreground">{t('errors.PANEL_NOT_FOUND')}</p>
		</div>
	)
}

function BackToBoard({ className, ...props }: ComponentProps<'button'>) {
	const { t } = useTranslation()
	return (
		<button
			type="button"
			onClick={clearHash}
			className={cn('inline-flex cursor-pointer items-center gap-1.5 text-base font-semibold text-foreground', className)}
			{...props}
		>
			<IconChevronLeft className="size-5" />
			{t('panel.task.back')}
		</button>
	)
}

/** Key, live state, title, and what else matters right now (when it was created, open decisions, why it waits). */
function TaskTop({ issue, className, ...props }: ComponentProps<'header'> & { issue: Issue }) {
	const { t } = useTranslation()
	const locale = useLocale()
	const token = usePanelToken()
	const { data } = useGetPanelIssue(token, issue.issueId)
	const column = TASK_COLUMN_OF[issue.lifeState]
	const created = createdAt(data?.timeline ?? [])
	const openAsks = (data?.openStops ?? []).filter(stop => stop.ask).length
	const meta = [
		created && formatTimeOfDay(created, locale),
		openAsks > 0 && t('task.openAsks', { count: openAsks }),
		issue.retryingAt && t('task.cardMeta.retryAt', { time: formatTimeOfDay(issue.retryingAt, locale) }),
		issue.waitingForProviderUntil && t('task.cardMeta.backAt', { time: formatTimeOfDay(issue.waitingForProviderUntil, locale) }),
		issue.escalatedAt && t('task.cardMeta.escalated'),
	].filter(Boolean)
	return (
		<header className={cn('flex flex-col gap-3', className)} {...props}>
			<div className="flex items-center justify-between gap-3 lg:hidden">
				<BackToBoard />
				<HoldButton issue={issue} />
			</div>
			<div className="flex items-start justify-between gap-4">
				<div className="flex min-w-0 flex-col gap-2">
					<div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
						<span className="shrink-0 font-mono text-base font-bold text-muted-foreground lg:text-lg lg:text-foreground">{issue.key}</span>
						<StatusPill tone={column} title={enumLabel('IssueLifeState', issue.lifeState)}>
							{t(`task.columns.${column}`)}
						</StatusPill>
					</div>
					<h1 className="text-2xl font-bold tracking-tight text-foreground lg:text-xl">{issue.title}</h1>
					{meta.length > 0 && <p className="font-mono text-[11.5px] text-caption-foreground">{meta.join(' · ')}</p>}
				</div>
				<HoldButton issue={issue} className="hidden lg:inline-flex" />
			</div>
		</header>
	)
}

/** PAUSAR / RETOMAR — only for whoever identified, and never on a finished task (parity, review M9). */
function HoldButton({ issue, className, ...props }: Omit<ComponentProps<typeof Button>, 'onClick'> & { issue: Issue }) {
	const { t } = useTranslation()
	const token = usePanelToken()
	const { data: me } = useGetPanelIdentity(token)
	const act = usePanelAction()
	const pending = usePanelActionPending()
	if (!me?.member || issue.lifeState === IssueLifeStateEnum.DONE) return null
	const paused = issue.lifeState === IssueLifeStateEnum.PAUSED
	return (
		<Button
			variant="outline"
			size="sm"
			className={className}
			disabled={pending}
			onClick={() => act({ kind: paused ? PanelActionKindEnum.RESUME : PanelActionKindEnum.PAUSE, issueId: issue.issueId })}
			{...props}
		>
			{paused ? <IconPlayerPlay className="size-4" /> : <IconPlayerPause className="size-4" />}
			{paused ? t('session.resumeIssue') : t('session.pauseIssue')}
		</Button>
	)
}

/** The conversation, then — for whoever may act — the steer field, then where the last action stands. */
function TaskConversationColumn({ issue, className, ...props }: ComponentProps<'section'> & { issue: PanelIssue }) {
	const { t } = useTranslation()
	const items = useMemo(() => {
		const open = new Map<string, OpenStop<AskView>>(
			issue.openStops.map(stop => [stop.stopId, { ask: stop.ask, resolutions: stop.resolutions }]),
		)
		return buildConversation(issue.timeline, { openStopOf: stopId => open.get(stopId) })
	}, [issue])
	// A chat opens at its latest message: once per task, the wide screen's scroller goes to the end (on a phone
	// the page itself scrolls, from the header down — this box does not scroll there, so this is a no-op).
	const scroller = useRef<HTMLDivElement>(null)
	const issueId = issue.issue.issueId
	useEffect(() => {
		const el = scroller.current
		if (el) el.scrollTop = el.scrollHeight
	}, [issueId])
	return (
		<section aria-label={t('task.conversation')} className={cn('min-w-0 flex-col', className)} {...props}>
			<div ref={scroller} className="flex-1 px-4 py-4 lg:min-h-0 lg:overflow-y-auto lg:px-8">
				{items.length === 0 ? (
					<p className="py-6 text-sm text-muted-foreground">{t('task.conversationEmpty')}</p>
				) : (
					<TaskConversation items={items} />
				)}
			</div>
			<div className="sticky bottom-0 flex flex-col gap-2 border-t border-border bg-background px-4 pt-3 pb-4 lg:static lg:px-8">
				<TaskSteer issue={issue.issue} />
				<PanelActionStatus issueId={issue.issue.issueId} />
			</div>
		</section>
	)
}

/** The task-scoped steer for whoever identified; an invitation to identify for whoever has not. */
function TaskSteer({
	issue,
	className,
	...props
}: Omit<ComponentProps<typeof SteerComposer>, 'value' | 'onValueChange' | 'onSubmit' | 'placeholder' | 'sendLabel'> & { issue: Issue }) {
	const { t } = useTranslation()
	const token = usePanelToken()
	const show = useDialogStore(state => state.show)
	const { data: me } = useGetPanelIdentity(token)
	// The uncommitted draft — truly local transient UI (state placement, case 5).
	const [text, setText] = useState('')
	const act = usePanelAction({ onSent: () => setText('') })
	const pending = usePanelActionPending()
	if (issue.lifeState === IssueLifeStateEnum.DONE || !me) return null
	if (!me.member) {
		return (
			<div className={cn('flex flex-wrap items-center justify-between gap-2', className)}>
				<p className="text-sm text-muted-foreground">{t('panel.task.identifyToAct')}</p>
				<Button variant="outline" size="sm" onClick={() => show(<IdentifyDialog />)}>
					{t('panel.identity.identify')}
				</Button>
			</div>
		)
	}
	const tooLong = !steerTextSchema.safeParse(text.trim()).success && text.trim().length > 0
	return (
		<SteerComposer
			className={className}
			value={text}
			onValueChange={setText}
			onSubmit={() => {
				const trimmed = text.trim()
				if (steerTextSchema.safeParse(trimmed).success) act({ kind: PanelActionKindEnum.STEER, issueId: issue.issueId, text: trimmed })
			}}
			pending={pending}
			placeholder={t('session.steerPlaceholder')}
			sendLabel={t('session.steer')}
			hint={tooLong ? t('panel.task.steerTooLong') : t('panel.task.steerHint')}
			{...props}
		/>
	)
}

type ArtifactItem = Extract<PanelIssue['timeline'][number], { kind: typeof IssueTimelineItemKindEnum.ARTIFACT }>

/** The task's artifacts, as its timeline recorded them (newest first). */
function artifactsOf(issue: PanelIssue): ArtifactItem[] {
	return issue.timeline.filter((item): item is ArtifactItem => item.kind === IssueTimelineItemKindEnum.ARTIFACT).reverse()
}

/** The right column: the artifacts (name and kind only — no preview in the cloud) and the facts about the task. */
function TaskSideColumn({ issue, className, ...props }: ComponentProps<'aside'> & { issue: PanelIssue }) {
	return (
		<aside className={cn('min-w-0 flex-col gap-7 px-4 py-5 lg:overflow-y-auto lg:px-5 lg:py-7', className)} {...props}>
			<TaskArtifacts issue={issue} />
			<TaskDetails issue={issue} />
		</aside>
	)
}

function SideSection({ title, className, children, ...props }: Omit<ComponentProps<'section'>, 'title'> & { title: ReactNode }) {
	return (
		<section className={cn('flex flex-col gap-3', className)} {...props}>
			<h2 className={cn(sectionLabel, 'border-b border-border pb-2')}>{title}</h2>
			{children}
		</section>
	)
}

function TaskArtifacts({ issue, className, ...props }: ComponentProps<'section'> & { issue: PanelIssue }) {
	const { t } = useTranslation()
	const locale = useLocale()
	const artifacts = artifactsOf(issue)
	return (
		<SideSection
			data-testid="panel-artifacts"
			title={t('task.artifactsCount', { count: artifacts.length })}
			className={className}
			{...props}
		>
			{artifacts.length === 0 ? (
				<p className="text-sm text-muted-foreground">{t('task.artifactsEmpty')}</p>
			) : (
				<>
					<div className="grid grid-cols-2 gap-2.5">
						{artifacts.map(artifact => {
							const Glyph = artifactGlyph[artifact.artifactKind]
							return (
								<ArtifactTile
									key={artifact.id}
									tone={artifact.artifactKind === ArtifactKindEnum.LINK ? 'link' : 'default'}
									glyph={<Glyph />}
									name={artifact.name}
									kind={enumLabel('ArtifactKind', artifact.artifactKind)}
									when={formatTimeOfDay(artifact.at, locale)}
								/>
							)
						})}
					</div>
					<p className="text-xs text-muted-foreground">{t('panel.task.artifactsNote')}</p>
				</>
			)}
		</SideSection>
	)
}

/** When it was created, how many retries, its batch (a link to `#L-n`), when it last changed. */
function TaskDetails({ issue, className, ...props }: ComponentProps<'section'> & { issue: PanelIssue }) {
	const { t } = useTranslation()
	const locale = useLocale()
	const created = createdAt(issue.timeline)
	const retries = retryCount(issue.timeline)
	const batch = batchOf(issue.timeline)
	const rows: [string, ReactNode][] = [
		[t('task.createdAt'), created ? formatDayAndTime(created, locale) : t('task.unknown')],
		[t('task.attempts'), retries === 0 ? t('task.noRetries') : t('task.retries', { count: retries })],
		...(batch
			? [
					[
						t('task.batch'),
						<a
							key="batch"
							href={`#${encodeURIComponent(batch.batchCode)}`}
							onClick={event => {
								event.preventDefault()
								openHash(batch.batchCode)
							}}
							className="underline-offset-4 hover:underline"
						>
							{t('task.batchItem', { code: batch.batchCode, n: batch.n })}
						</a>,
					] as [string, ReactNode],
				]
			: []),
		[t('panel.task.updated'), formatRelativeTime(issue.issue.updatedAt, locale)],
	]
	return (
		<SideSection title={t('task.details')} className={className} {...props}>
			<dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-2 gap-y-2.5 text-[13px]">
				{rows.map(([key, value]) => (
					<div key={key} className="contents">
						<dt className="text-muted-foreground">{key}</dt>
						<dd className="font-semibold text-foreground">{value}</dd>
					</div>
				))}
			</dl>
		</SideSection>
	)
}

/** The left column on a wide screen: the group, its health, and its tasks as a list (the open one selected). */
function TaskListColumn({ openIssueId, className, ...props }: ComponentProps<'aside'> & { openIssueId: string }) {
	const { t } = useTranslation()
	const token = usePanelToken()
	const { data: board } = useGetPanelBoard(token)
	const issues = useMemo(() => {
		const rank = (issue: { lifeState: Issue['lifeState'] }) => LIST_RANK[TASK_COLUMN_OF[issue.lifeState]]
		return [...(board?.issues ?? [])].sort((a, b) => rank(a) - rank(b))
	}, [board])
	return (
		<aside aria-label={t('panel.task.list')} className={cn('min-h-0 flex-col gap-3 overflow-y-auto p-4 xl:p-5', className)} {...props}>
			<GroupTitle />
			<IdentityChip compact />
			<HealthLine />
			<div className="flex flex-col gap-2.5 pt-1">
				{issues.map(issue => (
					<PanelTaskCard key={issue.issueId} issue={issue} withStatus selected={issue.issueId === openIssueId} />
				))}
			</div>
		</aside>
	)
}
