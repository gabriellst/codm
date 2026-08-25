import { useState } from 'react'
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { IconArrowUp, IconChevronLeft, IconPlayerPause } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
	getIssueDetailQueryKey,
	getNeedsYouPanelQueryKey,
	getSessionChatQueryKey,
	getSessionIssuesQueryKey,
	getHomeDashboardQueryKey,
	useArchiveIssue,
	useGetIssueDetail,
	useGetNeedsYouPanel,
	useResolveStop,
	useSteerIssue,
	IssueStatusEnum,
} from '@codm/client-typescript/typescript'
import type { GetIssueDetailQueryResponse, GetNeedsYouPanelQueryResponse, IssueStatus } from '@codm/client-typescript/typescript'
import { Button } from '@codm/app-ui/button'
import { Badge } from '@codm/app-ui/badge'
import { Textarea } from '@codm/app-ui/textarea'
import { Skeleton } from '@codm/app-ui/skeleton'
import { VirtualList } from '@codm/app-ui/virtual-list'
import { enumLabel } from '@/lib'
import { cn } from '@/lib/utils'
import { useTerminalStream, type TerminalStreamFrame } from '@/hooks'
import { Dot } from '@/components/console/StatusDot'
import { resolutionIsPrimary } from '@/components/console/glyphs'
import { TranscriptBubble } from '../TranscriptBubble'

type Detail = GetIssueDetailQueryResponse
type NeedsYouStop = GetNeedsYouPanelQueryResponse['stops'][number]

/**
 * D3 (R8-style) — "Precisa de entrada" is the one status that reads as an ALERT in the reference:
 * near-black fill, white text, a bright-green dot. The other two statuses keep the plain neutral
 * `outline` badge (no override). A closed dispatch map keyed by the enum — never an if/ternary chain
 * on the discriminant — colocated here because this exact near-black+success-bright pairing isn't in
 * the shared Badge variant inventory; nothing outside this screen's identity chip needs it.
 */
const issueStatusChipClass: Record<IssueStatus, string | undefined> = {
	[IssueStatusEnum.NEEDS_INPUT]:
		"border-transparent bg-foreground text-background before:size-1.5 before:shrink-0 before:rounded-full before:bg-success-bright before:content-['']",
	[IssueStatusEnum.WORKING]: undefined,
	[IssueStatusEnum.COMPLETED]: undefined,
}

/** One issue drill-down (T12): the dark terminal panel, routed messages, and an issue-scoped steer. */
export function IssueDetailSection({
	threadId,
	issueId,
	className,
	...props
}: ComponentProps<'div'> & { threadId: string; issueId: string }) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const navigate = useNavigate()
	const { data, isLoading } = useGetIssueDetail(issueId)
	const archive = useArchiveIssue()

	if (isLoading || !data) {
		return (
			<div className={cn('flex flex-col gap-4 py-4', className)} {...props}>
				<Skeleton className="h-8 w-64" />
				<Skeleton className="h-48 rounded-2xl" />
			</div>
		)
	}

	const onArchive = () => {
		archive.mutate(
			{ issueId },
			{
				onSuccess: () => {
					queryClient.invalidateQueries({ queryKey: getIssueDetailQueryKey(issueId) })
					queryClient.invalidateQueries({ queryKey: getSessionIssuesQueryKey(threadId) })
					navigate({ to: '/threads/$threadId/issues', params: { threadId } })
				},
			},
		)
	}

	return (
		<div className={cn('flex flex-col py-2 gap-2', className)} {...props}>
			<Link
				to="/threads/$threadId/issues"
				params={{ threadId }}
				className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
			>
				<IconChevronLeft className="size-4" /> {t('session.allIssues')}
			</Link>

			{/* D3 — the reference leads with the TASK KEY (mono, bold, the short code — "invoice-500"),
			    with the operator-dictated title as the smaller muted line under it; the old layout had
			    that inverted (title as the big heading, key as a mono subtitle). The title is still the
			    field that routinely outruns the column ("me manda um resumo do que o Odisseu fez…"), so
			    it keeps `min-w-0`/`truncate` down the flex chain — the key is short by construction and
			    doesn't need it, but gets it too in case a workspace ever mints a long one. The status chip
			    and the archive button are `shrink-0` so the SUMMARY is what gives way. */}
			<div className="flex items-start justify-between gap-4">
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<h1 className="truncate font-mono text-xl font-bold text-foreground" title={data.issue.key}>
						{data.issue.key}
					</h1>
					{/* `title` keeps the full sentence reachable on hover once it is visually cut. */}
					<p className="truncate text-sm text-muted-foreground" title={data.issue.title}>
						{data.issue.title}
						{data.issue.meta ? ` · ${data.issue.meta}` : ''}
					</p>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{/* Dispatch by map (`issueStatusChipClass`, module scope) — never a chain on the discriminant. */}
					<Badge variant="outline" className={issueStatusChipClass[data.issue.status]}>
						{enumLabel('IssueStatus', data.issue.status)}
					</Badge>
					{/* Não aparece no mock do D3 (o exemplo mostrado é uma tarefa aberta, "Precisa de entrada"),
					    mas a capacidade é real e não tem outro lugar no design para morar — código vence
					    aqui: mantida ao lado do chip de status em vez de removida por ausência no canvas. */}
					{!data.issue.archived && (
						<Button variant="outline" size="sm" disabled={archive.isPending} onClick={onArchive}>
							{t('session.archive')}
						</Button>
					)}
				</div>
			</div>

			<IssueStopBanner threadId={threadId} issueId={issueId} />

			<TerminalPanel issueId={issueId} lines={data.terminalLog} />

			{data.routedMessages.length > 0 && (
				<section className="flex flex-col gap-3">
					<h2 className="label-eyebrow">{t('session.messagesRoutedHere')}</h2>
					<div className="flex flex-col gap-4">
						{data.routedMessages.map(entry => (
							<TranscriptBubble key={entry.entryId} entry={entry} threadId={threadId} />
						))}
					</div>
				</section>
			)}

			<IssueSteerComposer issueId={issueId} />
		</div>
	)
}

/**
 * The paused-agent alert card (D3 — "Card / Paused Alert"): a pastel-green banner with the stop's
 * message and its resolution buttons, shown ABOVE the terminal while the issue's agent is stopped.
 *
 * Reuses `useGetNeedsYouPanel(threadId)` filtered to THIS issue rather than `data.stops` off
 * `GetIssueDetail` — that response carries the stop's `kind`/`title`/`detail` but not
 * `availableResolutions` (it's issue-scoped, no `stopId`-keyed action list), so there is nothing to
 * put on the Retry/Assumir buttons the reference draws. `GetNeedsYouPanel`'s stops are the same
 * `Stop` record with `availableResolutions` AND an optional `issueId` to filter by, and its
 * `useResolveStop()` mutation is keyed purely by `stopId` — identical whichever query surfaced it. No
 * new field, no invented client-side kind→resolution mapping.
 *
 * Renders NOTHING while there is no stop for this issue — the reference's card is conditional on the
 * agent actually being paused, not a permanent fixture of the screen.
 */
function IssueStopBanner({ threadId, issueId, className, ...props }: ComponentProps<'div'> & { threadId: string; issueId: string }) {
	const { data } = useGetNeedsYouPanel(threadId)
	const stops = (data?.stops ?? []).filter(stop => stop.issueId === issueId)

	if (stops.length === 0) return null

	return (
		<div className={cn('flex flex-col gap-2', className)} {...props}>
			{stops.map(stop => (
				<IssueStopCard key={stop.stopId} threadId={threadId} issueId={issueId} stop={stop} />
			))}
		</div>
	)
}

function IssueStopCard({
	threadId,
	issueId,
	stop,
	className,
	...props
}: ComponentProps<'div'> & { threadId: string; issueId: string; stop: NeedsYouStop }) {
	const queryClient = useQueryClient()
	// onSuccess on the MUTATION (hook options), not on `mutate()`'s second argument — same reasoning as
	// `NeedsYouPanel`'s `StopRow`: the observer's callback is dropped if this card unmounts (the stop
	// clearing removes it from the list) before the response lands.
	const resolve = useResolveStop({
		mutation: {
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: getNeedsYouPanelQueryKey(threadId) })
				queryClient.invalidateQueries({ queryKey: getIssueDetailQueryKey(issueId) })
				queryClient.invalidateQueries({ queryKey: getSessionChatQueryKey(threadId) })
				queryClient.invalidateQueries({ queryKey: getHomeDashboardQueryKey() })
			},
		},
	})

	return (
		// D3 — measured pixel-for-pixel (`Get` on `Card / Paused Alert`): `fill:#EAF6D3`/`color:#3D660A`
		// (= `bg-secondary`/`text-secondary-foreground`) with a solid `default` primary button and a
		// hollow `outline` secondary — NOT the dark `alertSurface`/`alertActionButton` pairing
		// `NeedsYouPanel` uses. Same `Stop` concept, a different surface for a different screen: this
		// card sits inline in a light page, `NeedsYouPanel` is its own near-black panel.
		<div
			className={cn(
				'flex flex-wrap items-center gap-3.5 rounded-asymmetric-md bg-secondary px-4 py-3.5 text-secondary-foreground',
				className,
			)}
			{...props}
		>
			<IconPlayerPause className="size-[1.1875rem] shrink-0" />
			<p className="min-w-0 flex-1 text-sm font-medium">
				{enumLabel('StopKind', stop.kind)}
				{stop.detail ? ` — ${stop.detail}` : ''}
			</p>
			<div className="flex shrink-0 items-center gap-2">
				{stop.availableResolutions.map(resolution => (
					<Button
						key={resolution}
						size="sm"
						variant={resolutionIsPrimary[resolution] ? 'default' : 'outline'}
						disabled={resolve.isPending}
						onClick={() => resolve.mutate({ stopId: stop.stopId, data: { resolution } })}
					>
						{enumLabel('StopResolution', resolution)}
					</Button>
				))}
			</div>
		</div>
	)
}

/**
 * The one dark surface in the console: a monospace terminal log on near-black.
 *
 * Two sources, concatenated in that order and never interleaved: the DURABLE log the detail query
 * returns (steers, replayed on every mount) followed by the LIVE tail of the issue's SSE session.
 * The live half is what Fase 7 made worth rendering — a tool call now arrives as
 * `browser.terminal_action_detected` carrying the CLI's REAL tool name plus a one-line input summary,
 * instead of a pre-flattened `⏺ Tool(args)` string the panel could print but not read. Rendering it
 * as its own row is the whole "net gain" of §4.9: the panel can finally say *which* tool, which is
 * the difference between a log and a status.
 */
/** One row of the panel: a replayed durable line, or a frame off the live stream. */
type TerminalRow = { key: string } & ({ kind: 'log'; line: string } | { kind: 'frame'; frame: TerminalStreamFrame })

function TerminalPanel({
	issueId,
	lines,
	className,
	...props
}: ComponentProps<'section'> & { issueId: string; lines: Detail['terminalLog'] }) {
	const { t } = useTranslation()
	const { connected, frames } = useTerminalStream(issueId)
	const empty = lines.length === 0 && frames.length === 0

	// The two sources become ONE list so the window spans both: a panel that virtualized only the live
	// tail would still put the whole replayed log in the DOM, and the durable half is the unbounded
	// one (`GetIssueDetail` selects `terminalLines` for the issue with no LIMIT, while the live tail is
	// capped at MAX_FRAMES). Concatenated, never interleaved — the original order is the contract.
	const rows: TerminalRow[] = [
		...lines.map((line, i) => ({ key: `log-${line.at}-${i}`, kind: 'log' as const, line: line.line })),
		...frames.map((frame, i) => ({ key: `frame-${frame.at}-${i}`, kind: 'frame' as const, frame })),
	]

	return (
		<section className={cn('flex flex-col gap-3', className)} {...props}>
			<div className="flex items-center gap-2">
				<h2 className="label-eyebrow">{t('session.terminalSession')}</h2>
				{connected && (
					<span
						data-testid="terminal-stream-connected"
						title={t('session.terminalLive')}
						className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
					>
						<Dot className="size-1.5 bg-success" />
						{t('session.terminalLive')}
					</span>
				)}
			</div>
			{empty ? (
				<div
					data-testid="terminal-panel"
					className="rounded-2xl bg-[oklch(0.16_0_0)] p-4 font-mono text-sm leading-relaxed text-[oklch(0.9_0_0)]"
				>
					<p className="text-[oklch(0.6_0_0)]">{t('session.waitingTerminal')}</p>
				</div>
			) : (
				/* A BOUNDED BOX, which is new: the panel used to grow with the log and push the steer
				   composer off the bottom of a long run, and windowing needs a scroller with a definite
				   height anyway. `h-96` is the terminal's own viewport now, and being end-anchored it
				   follows the output while it streams — unless the operator has scrolled up to read, which
				   is exactly the case VirtualList keeps. `overflow-x-auto` survives the merge with the
				   list's own `overflow-y-auto` (different axes), and rows are `w-max min-w-full` so a long
				   unwrapped line still scrolls sideways instead of being clipped by a `w-full` row. */
				<VirtualList
					data-testid="terminal-panel"
					items={rows}
					getItemKey={row => row.key}
					estimatedItemHeight={22}
					className="h-96 overflow-x-auto rounded-2xl bg-[oklch(0.16_0_0)] p-4 font-mono text-sm leading-relaxed text-[oklch(0.9_0_0)]"
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
		</section>
	)
}

/** One live SSE frame: a plain output line, or the structured tool call the re-key made legible. */
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

function IssueSteerComposer({ issueId, className, ...props }: ComponentProps<'div'> & { issueId: string }) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const [text, setText] = useState('')
	const steer = useSteerIssue()

	const send = () => {
		const trimmed = text.trim()
		if (!trimmed || steer.isPending) return
		steer.mutate(
			{ issueId, data: { text: trimmed } },
			{
				onSuccess: () => {
					setText('')
					queryClient.invalidateQueries({ queryKey: getIssueDetailQueryKey(issueId) })
				},
			},
		)
	}

	return (
		<div className={cn('flex flex-col gap-2', className)} {...props}>
			{/* Shape owned by the CLI's `composer` block: bun cli component <route> <Name> --mutation=<Hook> */}
			<div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2">
				<Textarea
					value={text}
					onChange={e => setText(e.target.value)}
					onKeyDown={e => {
						if (e.key === 'Enter' && !e.shiftKey) {
							e.preventDefault()
							send()
						}
					}}
					placeholder={t('session.steerPlaceholder')}
					className="min-h-10 flex-1 resize-none border-0 bg-transparent focus-visible:ring-0"
				/>
				<Button size="icon" aria-label={t('session.steer')} disabled={!text.trim() || steer.isPending} onClick={send}>
					<IconArrowUp />
				</Button>
			</div>
			<p className="px-1 text-xs text-muted-foreground">{t('session.steerHint')}</p>
		</div>
	)
}
