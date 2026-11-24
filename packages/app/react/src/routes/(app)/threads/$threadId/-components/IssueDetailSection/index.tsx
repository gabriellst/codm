import { useState } from 'react'
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { IconArchive, IconChevronLeft, IconPlayerPause, IconPlayerPlay } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
	getIssueDetailQueryKey,
	getIssueTimelineQueryKey,
	getSessionIssuesQueryKey,
	useArchiveIssue,
	usePauseIssue,
	useResumeIssue,
	useGetIssueDetail,
	useGetIssueTimeline,
	useGetNeedsYouPanel,
	useGetSessionChat,
	useSteerIssue,
	IssueStatusEnum,
} from '@codm/client-typescript/typescript'
import type { GetIssueDetailQueryResponse } from '@codm/client-typescript/typescript'
import { Button } from '@codm/app-ui/button'
import { Skeleton } from '@codm/app-ui/skeleton'
import { StatusPill } from '@codm/app-ui/status-pill'
import { SteerComposer } from '@codm/app-ui/steer-composer'
import { EscalatedBadge, ProviderWaitBadge, RetryWaitBadge } from '@/components/console/IssueRow'
import { providerLabel } from '@/components/console/glyphs'
import { useLocale } from '@/hooks'
import { enumLabel } from '@/lib'
import { formatTimeOfDay } from '@/lib/format'
import { TASK_COLUMN_OF } from '@/lib/task/issueBoard'
import { createdAt, requesterEntryId } from '@/lib/task/taskConversation'
import { cn } from '@/lib/utils'
import { DesktopTaskSurface } from './DesktopTaskSurface'
import { TaskConversationSection } from './TaskConversationSection'
import { TaskSidePanel } from './TaskSidePanel'

type Detail = GetIssueDetailQueryResponse

/**
 * One task, inside (P1 — `.specs/2026-11-24-tarefa-e-painel-design.md` §3): its header, ONE conversation
 * (what people said, what the agent answered, the steers, the artifacts, the open decision — every other fact
 * a thin line) with the steer field under it, and on the side its artifacts, its terminal session and its
 * details. Everything the conversation can act on goes through the desktop's surface port.
 */
export function IssueDetailSection({
	threadId,
	issueId,
	className,
	...props
}: ComponentProps<'div'> & { threadId: string; issueId: string }) {
	const { t } = useTranslation()
	const { data, isLoading } = useGetIssueDetail(issueId)

	if (isLoading || !data) {
		return (
			<div className={cn('flex flex-col gap-4 py-4', className)} {...props}>
				<Skeleton className="h-8 w-64" />
				<Skeleton className="h-48 rounded-asymmetric-md" />
			</div>
		)
	}

	return (
		<DesktopTaskSurface threadId={threadId} issueId={issueId}>
			<div className={cn('flex flex-col gap-3.5 py-2', className)} {...props}>
				<Link
					to="/threads/$threadId/issues"
					params={{ threadId }}
					search={{ done: false }}
					className="inline-flex w-fit items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
				>
					<IconChevronLeft className="size-4" /> {t('session.allIssues')}
				</Link>

				<TaskHeader threadId={threadId} detail={data} />

				<div className="flex flex-col gap-7 lg:flex-row lg:items-start">
					<div className="flex min-w-0 flex-1 flex-col gap-3">
						<TaskConversationSection threadId={threadId} issueId={issueId} />
						{!data.issue.archived && (
							<IssueSteerComposer threadId={threadId} issueId={issueId} className="sticky bottom-0 bg-background pt-2 pb-1" />
						)}
					</div>
					<TaskSidePanel threadId={threadId} issueId={issueId} detail={data} />
				</div>
			</div>
		</DesktopTaskSurface>
	)
}

/** Key, title and live state on one line; who asked, when, which agent and the open decisions under it. */
function TaskHeader({ threadId, detail, className, ...props }: ComponentProps<'div'> & { threadId: string; detail: Detail }) {
	const { t } = useTranslation()
	const locale = useLocale()
	const queryClient = useQueryClient()
	const navigate = useNavigate()
	const { issue } = detail
	// The effects ride the MUTATION (bp-30): they still run if this header unmounts before the answer lands.
	const archive = useArchiveIssue({
		mutation: {
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: getIssueDetailQueryKey(issue.issueId) })
				queryClient.invalidateQueries({ queryKey: getIssueTimelineQueryKey(issue.issueId) })
				queryClient.invalidateQueries({ queryKey: getSessionIssuesQueryKey(threadId) })
				navigate({ to: '/threads/$threadId/issues', params: { threadId }, search: { done: false } })
			},
		},
	})
	const { data: timeline } = useGetIssueTimeline(issue.issueId)
	const { data: chat } = useGetSessionChat(threadId)
	const { data: needsYou } = useGetNeedsYouPanel(threadId)
	const items = timeline?.items ?? []
	const requester = requesterEntryId(items)
	const requesterName = chat?.transcript.find(entry => entry.entryId === requester)?.sender?.displayName
	const created = createdAt(items)
	const openAsks = (needsYou?.stops ?? []).filter(stop => stop.issueId === issue.issueId && stop.ask).length
	const meta = [
		requesterName && t('task.metaRequestedBy', { name: requesterName }),
		created && formatTimeOfDay(created, locale),
		providerLabel[detail.provider],
		openAsks > 0 && t('task.openAsks', { count: openAsks }),
	].filter(Boolean)

	const onArchive = () => archive.mutate({ issueId: issue.issueId })

	return (
		<div className={cn('flex items-start justify-between gap-4', className)} {...props}>
			<div className="flex min-w-0 flex-1 flex-col gap-1.5">
				<div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
					<h1 className="shrink-0 font-mono text-[19px] font-bold text-foreground">{issue.key}</h1>
					{/* `title` keeps the full sentence reachable on hover once it is visually cut. */}
					<p className="min-w-0 truncate text-[19px] font-bold tracking-tight text-foreground" title={issue.title}>
						{issue.title}
					</p>
					{/* The kanban column's name — the same words the board shows; the exact state rides the `title`. */}
					<StatusPill tone={TASK_COLUMN_OF[issue.lifeState]} title={enumLabel('IssueLifeState', issue.lifeState)}>
						{t(`task.columns.${TASK_COLUMN_OF[issue.lifeState]}`)}
					</StatusPill>
				</div>
				<p className="font-mono text-[11.5px] text-caption-foreground">{meta.join(' · ')}</p>
				{(issue.waitingForProviderUntil || issue.retryingAt || issue.escalatedAt) && (
					<div className="flex flex-wrap items-center gap-2">
						{issue.waitingForProviderUntil && <ProviderWaitBadge until={issue.waitingForProviderUntil} />}
						{issue.retryingAt && <RetryWaitBadge at={issue.retryingAt} />}
						{issue.escalatedAt && <EscalatedBadge at={issue.escalatedAt} />}
					</div>
				)}
			</div>
			<div className="flex shrink-0 items-center gap-2">
				<IssueHoldButton issue={issue} threadId={threadId} />
				{!issue.archived && (
					<Button variant="outline" size="sm" disabled={archive.isPending} onClick={onArchive}>
						<IconArchive className="size-4" />
						{t('session.archive')}
					</Button>
				)}
			</div>
		</div>
	)
}

/**
 * PAUSE / RESUME (fase 2, item 2) — the console twin of "pare" / "continue" in the group. One button: it
 * resumes a paused issue, and pauses one whose work can still move (not completed, not archived — the
 * entity refuses those with ISSUE_NOT_PAUSABLE, so the button is simply not offered).
 */
function IssueHoldButton({
	issue,
	threadId,
	className,
	...props
}: Omit<ComponentProps<typeof Button>, 'onClick'> & { issue: Detail['issue']; threadId: string }) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const refresh = {
		mutation: {
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: getIssueDetailQueryKey(issue.issueId) })
				queryClient.invalidateQueries({ queryKey: getIssueTimelineQueryKey(issue.issueId) })
				queryClient.invalidateQueries({ queryKey: getSessionIssuesQueryKey(threadId) })
			},
		},
	}
	const pause = usePauseIssue(refresh)
	const resume = useResumeIssue(refresh)
	const pausable = !issue.archived && issue.status !== IssueStatusEnum.COMPLETED

	if (issue.paused) {
		return (
			<Button
				variant="outline"
				size="sm"
				className={className}
				disabled={resume.isPending}
				onClick={() => resume.mutate({ issueId: issue.issueId })}
				{...props}
			>
				<IconPlayerPlay className="size-4" />
				{t('session.resumeIssue')}
			</Button>
		)
	}
	if (!pausable) return null
	return (
		<Button
			variant="outline"
			size="sm"
			className={className}
			disabled={pause.isPending}
			onClick={() => pause.mutate({ issueId: issue.issueId })}
			{...props}
		>
			<IconPlayerPause className="size-4" />
			{t('session.pauseIssue')}
		</Button>
	)
}

/** The task-scoped steer — reaches only the agent working this task; the group does not see it. */
function IssueSteerComposer({
	threadId,
	issueId,
	className,
	...props
}: Omit<ComponentProps<'div'>, 'onSubmit'> & { threadId: string; issueId: string }) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	// The uncommitted draft — truly local transient UI (state placement, case 5).
	const [text, setText] = useState('')
	const steer = useSteerIssue({
		mutation: {
			onSuccess: () => {
				setText('')
				queryClient.invalidateQueries({ queryKey: getIssueDetailQueryKey(issueId) })
				queryClient.invalidateQueries({ queryKey: getIssueTimelineQueryKey(issueId) })
				queryClient.invalidateQueries({ queryKey: getSessionIssuesQueryKey(threadId) })
			},
		},
	})

	const send = () => {
		const trimmed = text.trim()
		if (!trimmed || steer.isPending) return
		steer.mutate({ issueId, data: { text: trimmed } })
	}

	return (
		<SteerComposer
			className={className}
			value={text}
			onValueChange={setText}
			onSubmit={send}
			pending={steer.isPending}
			placeholder={t('session.steerPlaceholder')}
			sendLabel={t('session.steer')}
			hint={t('session.steerHint')}
			{...props}
		/>
	)
}
