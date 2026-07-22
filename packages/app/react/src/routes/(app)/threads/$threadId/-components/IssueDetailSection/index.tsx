import { useState } from 'react'
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
import { issueStatusLabel } from '@/components/console/glyphs'
import { TranscriptBubble } from '../TranscriptBubble'

type Detail = GetIssueDetailQueryResponse

/** One issue drill-down (T12): the dark terminal panel, routed messages, and an issue-scoped steer. */
export function IssueDetailSection({ threadId, issueId }: { threadId: string; issueId: string }) {
	const queryClient = useQueryClient()
	const navigate = useNavigate()
	const { data, isLoading } = useGetIssueDetail(issueId)
	const archive = useArchiveIssue()

	if (isLoading || !data) {
		return (
			<div className="flex flex-col gap-4 py-4">
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
		<div className="flex flex-col gap-6 py-2">
			<Link
				to="/threads/$threadId/issues"
				params={{ threadId }}
				className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
			>
				<IconChevronLeft className="size-4" /> All issues
			</Link>

			<div className="flex items-start justify-between gap-4">
				<div className="flex flex-col gap-2">
					<div className="flex items-center gap-3">
						<h1 className="heading-display text-2xl text-foreground">{data.issue.title}</h1>
						<Badge variant="outline">{issueStatusLabel[data.issue.status]}</Badge>
					</div>
					<p className="font-mono text-sm text-muted-foreground">
						{data.issue.key}
						{data.issue.meta ? ` · ${data.issue.meta}` : ''}
					</p>
				</div>
				{!data.issue.archived && (
					<Button variant="outline" size="sm" disabled={archive.isPending} onClick={onArchive}>
						Archive
					</Button>
				)}
			</div>

			<TerminalPanel lines={data.terminalLog} />

			{data.routedMessages.length > 0 && (
				<section className="flex flex-col gap-3">
					<h2 className="label-eyebrow">Messages routed here</h2>
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

/** The one dark surface in the console: a monospace terminal log on near-black. */
function TerminalPanel({ lines }: { lines: Detail['terminalLog'] }) {
	return (
		<section className="flex flex-col gap-3">
			<h2 className="label-eyebrow">Terminal session</h2>
			<div className="overflow-x-auto rounded-2xl bg-[oklch(0.16_0_0)] p-4 font-mono text-sm leading-relaxed text-[oklch(0.9_0_0)]">
				{lines.length === 0 ? (
					<p className="text-[oklch(0.6_0_0)]">Waiting for terminal output…</p>
				) : (
					lines.map((line, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: terminal log is append-only — index is a stable identity
						<div key={`${line.at}-${i}`} className="flex gap-2 whitespace-pre">
							<span className="select-none text-[oklch(0.55_0_0)]">›</span>
							<span>{line.line}</span>
						</div>
					))
				)}
			</div>
		</section>
	)
}

function IssueSteerComposer({ issueId }: { issueId: string }) {
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
					placeholder="Steer this issue…"
					className="min-h-10 flex-1 resize-none border-0 bg-transparent focus-visible:ring-0"
				/>
				<Button size="icon" aria-label="Steer" disabled={!text.trim() || steer.isPending} onClick={send}>
					<IconArrowUp />
				</Button>
			</div>
			<p className="px-1 text-xs text-muted-foreground">Steers reach the agent working this issue only.</p>
		</div>
	)
}
