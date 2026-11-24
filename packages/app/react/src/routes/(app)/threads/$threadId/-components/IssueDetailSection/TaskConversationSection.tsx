import { useMemo, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useGetIssueTimeline, useGetNeedsYouPanel } from '@codm/client-typescript/typescript'
import { Skeleton } from '@codm/app-ui/skeleton'
import { TaskConversation } from '@/components/task/TaskConversation'
import type { AskView } from '@/components/task/TaskSurface'
import { buildConversation, type OpenStop } from '@/lib/task/taskConversation'
import { cn } from '@/lib/utils'

/**
 * The desktop's task conversation: the issue's timeline, with every stop still open (from the needs-you
 * panel, which carries how to answer it) turned into its card. Needs a `DesktopTaskSurface` above it.
 */
export function TaskConversationSection({
	threadId,
	issueId,
	className,
	...props
}: ComponentProps<'section'> & { threadId: string; issueId: string }) {
	const { t } = useTranslation()
	const { data: timeline, isLoading } = useGetIssueTimeline(issueId)
	const { data: needsYou } = useGetNeedsYouPanel(threadId)

	const items = useMemo(() => {
		const open = new Map<string, OpenStop<AskView>>()
		for (const stop of needsYou?.stops ?? [])
			if (stop.issueId === issueId)
				open.set(stop.stopId, { ask: stop.ask, resolutions: stop.availableResolutions, detail: stop.detail || undefined })
		return buildConversation(timeline?.items ?? [], { openStopOf: stopId => open.get(stopId) })
	}, [timeline, needsYou, issueId])

	return (
		<section aria-label={t('task.conversation')} className={cn('flex min-w-0 flex-col gap-3', className)} {...props}>
			{isLoading || !timeline ? (
				<Skeleton className="h-40 rounded-asymmetric-md" />
			) : items.length === 0 ? (
				<p className="py-6 text-sm text-muted-foreground">{t('task.conversationEmpty')}</p>
			) : (
				<TaskConversation items={items} />
			)}
		</section>
	)
}
