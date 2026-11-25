import { useState, type ComponentProps, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
	ArtifactKindEnum,
	useGetIssueTimeline,
	useGetSessionChat,
	useListArtifacts,
	type GetIssueDetailQueryResponse,
} from '@codm/client-typescript/typescript'
import { ArtifactTile } from '@codm/app-ui/artifact-tile'
import { Button } from '@codm/app-ui/button'
import { sectionLabel } from '@codm/app-ui/surfaces'
import { VirtualList } from '@codm/app-ui/virtual-list'
import { Dot } from '@/components/console/StatusDot'
import { providerLabel } from '@/components/console/glyphs'
import { useTaskSurface } from '@/components/task/TaskSurface'
import { useLocale, useTerminalStream, type TerminalStreamFrame } from '@/hooks'
import { enumLabel } from '@/lib'
import { formatDayAndTime, formatTimeOfDay } from '@/lib/format'
import { artifactGlyph } from '@/lib/task/artifactGlyph'
import { batchOf, createdAt, requesterEntryId, retryCount } from '@/lib/task/taskConversation'
import { cn } from '@/lib/utils'
import { artifactContentUrl } from '../ArtifactPreview'

type Detail = GetIssueDetailQueryResponse

/** The task page's right column — its artifacts, its terminal session and the facts about it (P1). */
export function TaskSidePanel({
	threadId,
	issueId,
	detail,
	className,
	...props
}: ComponentProps<'aside'> & { threadId: string; issueId: string; detail: Detail }) {
	return (
		<aside className={cn('flex w-full flex-col gap-6 lg:w-[21.25rem] lg:shrink-0', className)} {...props}>
			<TaskArtifacts threadId={threadId} issueId={issueId} />
			<SessionPanel issueId={issueId} lines={detail.terminalLog} />
			<TaskDetails threadId={threadId} issueId={issueId} detail={detail} />
		</aside>
	)
}

function SideSection({
	title,
	action,
	className,
	children,
	...props
}: Omit<ComponentProps<'section'>, 'title'> & { title: ReactNode; action?: ReactNode }) {
	return (
		<section className={cn('flex flex-col gap-3', className)} {...props}>
			<header className={cn(sectionLabel, 'flex items-center justify-between gap-2')}>
				<h2>{title}</h2>
				{action}
			</header>
			{children}
		</section>
	)
}

/** The artifacts this task produced (`ListArtifacts` of the conversation, filtered to the task). */
function TaskArtifacts({ threadId, issueId, className, ...props }: ComponentProps<'section'> & { threadId: string; issueId: string }) {
	const { t } = useTranslation()
	const locale = useLocale()
	const surface = useTaskSurface()
	const { data } = useListArtifacts(threadId)
	const mine = (data?.artifacts ?? []).filter(artifact => artifact.issueId === issueId)
	return (
		<SideSection data-testid="task-artifacts" title={t('task.artifactsCount', { count: mine.length })} className={className} {...props}>
			{mine.length === 0 ? (
				<p className="text-sm text-muted-foreground">{t('task.artifactsEmpty')}</p>
			) : (
				<div className="grid grid-cols-2 gap-2.5">
					{mine.map(artifact => {
						const Glyph = artifactGlyph[artifact.kind]
						return (
							<ArtifactTile
								key={artifact.artifactId}
								tone={artifact.kind === ArtifactKindEnum.LINK ? 'link' : 'default'}
								glyph={<Glyph />}
								name={artifact.name}
								kind={enumLabel('ArtifactKind', artifact.kind)}
								when={formatTimeOfDay(artifact.recordedAt, locale)}
								thumb={
									artifact.kind === ArtifactKindEnum.IMAGE ? (
										<img alt="" src={artifactContentUrl(threadId, artifact.artifactId)} className="size-full object-cover" />
									) : undefined
								}
								render={<button type="button" onClick={() => surface.openArtifact?.(artifact.artifactId)} />}
							/>
						)
					})}
				</div>
			)}
		</SideSection>
	)
}

/** Who asked, which agent, how many retries, the batch — read from the task's own timeline and detail. */
function TaskDetails({
	threadId,
	issueId,
	detail,
	className,
	...props
}: ComponentProps<'section'> & { threadId: string; issueId: string; detail: Detail }) {
	const { t } = useTranslation()
	const locale = useLocale()
	const { data: timeline } = useGetIssueTimeline(issueId)
	const { data: chat } = useGetSessionChat(threadId)
	const items = timeline?.items ?? []
	const requester = requesterEntryId(items)
	const requesterName = chat?.transcript.find(entry => entry.entryId === requester)?.sender?.displayName
	const created = createdAt(items)
	const retries = retryCount(items)
	const batch = batchOf(items)
	const rows: [string, ReactNode][] = [
		[t('task.requestedBy'), requesterName ?? t('task.unknown')],
		[t('task.createdAt'), created ? formatDayAndTime(created, locale) : t('task.unknown')],
		[t('task.agent'), providerLabel[detail.provider]],
		[t('task.attempts'), retries === 0 ? t('task.noRetries') : t('task.retries', { count: retries })],
		...(batch ? [[t('task.batch'), t('task.batchItem', { code: batch.batchCode, n: batch.n })] as [string, ReactNode]] : []),
	]
	return (
		<SideSection title={t('task.details')} className={className} {...props}>
			<dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-2 gap-y-2.5 text-[12.5px]">
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

/** One row of the terminal: a replayed durable line, or a frame off the live stream. */
type TerminalRow = { key: string } & ({ kind: 'log'; line: string } | { kind: 'frame'; frame: TerminalStreamFrame })

/**
 * The task's terminal SESSION (P1 — "Sessão"), moved off the main column into the side. It is the ONE place
 * the page mounts `useTerminalStream` (a second observer of an issue answers 409), and it is open from the
 * start — the live tail and the tool rows are visible on load. "Expandir" only makes the box taller, in place.
 *
 * Two sources, concatenated in that order and never interleaved: the DURABLE log the detail query returns,
 * then the LIVE tail of the issue's SSE session (each tool call its own row, with the CLI's real tool name).
 */
function SessionPanel({
	issueId,
	lines,
	className,
	...props
}: ComponentProps<'section'> & { issueId: string; lines: Detail['terminalLog'] }) {
	const { t } = useTranslation()
	const { connected, frames } = useTerminalStream(issueId)
	// Private disclosure of this box — truly local transient UI (state placement, case 5).
	const [expanded, setExpanded] = useState(false)
	const empty = lines.length === 0 && frames.length === 0
	const rows: TerminalRow[] = [
		...lines.map((line, i) => ({ key: `log-${line.at}-${i}`, kind: 'log' as const, line: line.line })),
		...frames.map((frame, i) => ({ key: `frame-${frame.at}-${i}`, kind: 'frame' as const, frame })),
	]
	return (
		<SideSection
			title={
				<span className="inline-flex items-center gap-2">
					{t('task.session')}
					{connected && (
						<span
							data-testid="terminal-stream-connected"
							title={t('session.terminalLive')}
							className="inline-flex items-center gap-1.5 text-xs font-normal text-muted-foreground"
						>
							<Dot className="size-1.5 bg-success" />
							{t('session.terminalLive')}
						</span>
					)}
				</span>
			}
			action={
				<Button
					variant="link"
					size="xs"
					className="h-auto p-0 text-muted-foreground"
					aria-expanded={expanded}
					onClick={() => setExpanded(value => !value)}
				>
					{expanded ? t('task.collapse') : t('task.expand')}
				</Button>
			}
			className={className}
			{...props}
		>
			{empty ? (
				<div
					data-testid="terminal-panel"
					className="rounded-asymmetric-sm bg-[oklch(0.16_0_0)] p-3 font-mono text-xs leading-relaxed text-[oklch(0.6_0_0)]"
				>
					{t('session.waitingTerminal')}
				</div>
			) : (
				<VirtualList
					data-testid="terminal-panel"
					items={rows}
					getItemKey={row => row.key}
					estimatedItemHeight={20}
					className={cn(
						'overflow-x-auto rounded-asymmetric-sm bg-[oklch(0.16_0_0)] p-3 font-mono text-xs leading-relaxed text-[oklch(0.9_0_0)]',
						expanded ? 'h-[60vh]' : 'h-64',
					)}
					itemClassName="w-max min-w-full"
					renderItem={row =>
						row.kind === 'log' ? (
							<div className="flex gap-2 whitespace-pre">
								<span className="select-none text-[oklch(0.55_0_0)]">›</span>
								<span>{row.line}</span>
							</div>
						) : (
							<TerminalFrameRow frame={row.frame} />
						)
					}
				/>
			)}
		</SideSection>
	)
}

/** One live SSE frame: a plain output line, or the structured tool call. */
function TerminalFrameRow({ frame, className, ...props }: ComponentProps<'div'> & { frame: TerminalStreamFrame }) {
	if (frame.name === 'browser.terminal_action_detected') {
		return (
			<div data-testid="terminal-action" className="flex gap-2 whitespace-pre">
				<span className="select-none text-[oklch(0.55_0_0)]">⏺</span>
				<span data-testid="terminal-action-tool" className="text-[oklch(0.82_0.13_150)]">
					{frame.tool}
				</span>
				{frame.input && <span className="text-[oklch(0.68_0_0)]">{frame.input}</span>}
			</div>
		)
	}
	return (
		<div className={cn('flex gap-2 whitespace-pre', className)} {...props}>
			<span className="select-none text-[oklch(0.55_0_0)]">›</span>
			<span className={frame.stream === 'stderr' ? 'text-[oklch(0.72_0.16_25)]' : undefined}>{frame.line}</span>
		</div>
	)
}
