import { useState } from 'react'
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { IconArrowUp, IconChevronLeft } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
	getIssueDetailQueryKey,
	getSessionIssuesQueryKey,
	useArchiveIssue,
	useGetIssueDetail,
	useSteerIssue,
} from '@codedm/client-typescript/typescript'
import type { GetIssueDetailQueryResponse } from '@codedm/client-typescript/typescript'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { enumLabel } from '@/lib'
import { cn } from '@/lib/utils'
import { useTerminalStream, type TerminalStreamFrame } from '@/hooks'
import { Dot } from '@/components/console/StatusDot'
import { TranscriptBubble } from '../TranscriptBubble'

type Detail = GetIssueDetailQueryResponse

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

			{/* An issue title is a SENTENCE the operator dictated ("me manda um resumo do que o Odisseu
			    fez…"), not a label, so it routinely outruns the column. Truncating it needs the whole flex
			    chain to be ALLOWED to shrink — `min-w-0` on every ancestor down to the text — because a
			    flex item defaults to `min-width: auto` and refuses to go below its content, so the row
			    grows instead and shoves the archive button off the edge. The badge and the button are
			    `shrink-0` so the NAME is what gives way, which is what puts the ellipsis on it. */}
			<div className="flex items-start justify-between gap-4">
				<div className="flex min-w-0 flex-1 flex-col gap-2">
					<div className="flex min-w-0 items-center gap-3">
						{/* `title` keeps the full text reachable on hover once it is visually cut. */}
						<h1 className="heading-display truncate text-2xl text-foreground" title={data.issue.title}>
							{data.issue.title}
						</h1>
						<Badge variant="outline" className="shrink-0">
							{enumLabel('IssueStatus', data.issue.status)}
						</Badge>
					</div>
					<p className="truncate font-mono text-sm text-muted-foreground">
						{data.issue.key}
						{data.issue.meta ? ` · ${data.issue.meta}` : ''}
					</p>
				</div>
				{!data.issue.archived && (
					<Button variant="outline" size="sm" className="shrink-0" disabled={archive.isPending} onClick={onArchive}>
						{t('session.archive')}
					</Button>
				)}
			</div>

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
function TerminalPanel({ issueId, lines }: { issueId: string; lines: Detail['terminalLog'] }) {
	const { t } = useTranslation()
	const { connected, frames } = useTerminalStream(issueId)
	const empty = lines.length === 0 && frames.length === 0

	return (
		<section className="flex flex-col gap-3 g-">
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
			<div
				data-testid="terminal-panel"
				className="overflow-x-auto rounded-2xl bg-[oklch(0.16_0_0)] p-4 font-mono text-sm leading-relaxed text-[oklch(0.9_0_0)]"
			>
				{empty ? (
					<p className="text-[oklch(0.6_0_0)]">{t('session.waitingTerminal')}</p>
				) : (
					<>
						{lines.map((line, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: terminal log is append-only — index is a stable identity
							<div key={`log-${line.at}-${i}`} className="flex gap-2 whitespace-pre">
								<span className="select-none text-[oklch(0.55_0_0)]">›</span>
								<span>{line.line}</span>
							</div>
						))}
						{frames.map((frame, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: the live tail is append-only — index is a stable identity
							<TerminalFrameRow key={`frame-${frame.at}-${i}`} frame={frame} />
						))}
					</>
				)}
			</div>
		</section>
	)
}

/** One live SSE frame: a plain output line, or the structured tool call the re-key made legible. */
function TerminalFrameRow({ frame }: { frame: TerminalStreamFrame }) {
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
		<div className="flex gap-2 whitespace-pre">
			<span className="select-none text-[oklch(0.55_0_0)]">›</span>
			<span className={frame.stream === 'stderr' ? 'text-[oklch(0.72_0.16_25)]' : undefined}>{frame.line}</span>
		</div>
	)
}

function IssueSteerComposer({ issueId }: { issueId: string }) {
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
		<div className="flex flex-col gap-2">
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
