import { useMemo, type ComponentProps, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import {
	getHomeDashboardQueryKey,
	getIssueDetailQueryKey,
	getIssueTimelineQueryKey,
	getNeedsYouPanelQueryKey,
	getSessionChatQueryKey,
	getSessionIssuesQueryKey,
	useGetSessionChat,
	useListArtifacts,
	useResolveStop,
} from '@codm/client-typescript/typescript'
import { DialogContent, DialogHeader, DialogTitle } from '@codm/app-ui/dialog'
import { TaskSurfaceProvider, type MessageSender, type TaskSurface } from '@/components/task/TaskSurface'
import type { EventDetailCapabilities } from '@/components/task/TaskEventDetail'
import { answerTextSchema, useAnswerAsk } from '@/components/task/useAnswerAsk'
import { cn } from '@/lib/utils'
import { useDialogStore } from '@/stores/useDialogStore'
import { ArtifactPreview, type Artifact } from '../ArtifactPreview'

const threadRoute = getRouteApi('/(app)/threads/$threadId')

/** "Ana Ribeiro" → "AR"; one word → its first two letters. */
export function initialsOf(name: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean)
	if (words.length === 0) return '?'
	if (words.length === 1) return (words[0] ?? '').slice(0, 2).toUpperCase()
	return `${words[0]?.[0] ?? ''}${words[words.length - 1]?.[0] ?? ''}`.toUpperCase()
}

/**
 * The DESKTOP side of the task conversation's port (`TaskSurface`): the operator answers and resolves through
 * the daemon, who wrote each message comes from the conversation's transcript (joined by entry id), an
 * artifact opens in the same preview the artifacts tab uses, and the event lines get the publish output and
 * the batch link.
 */
export function DesktopTaskSurface({ threadId, issueId, children }: { threadId: string; issueId: string; children: ReactNode }) {
	const queryClient = useQueryClient()
	const answer = useAnswerAsk({ threadId, issueId })
	// onSuccess on the MUTATION (hook options): the card unmounts once the stop clears, before the response lands.
	const resolve = useResolveStop({
		mutation: {
			onSuccess: () => {
				for (const queryKey of [
					getNeedsYouPanelQueryKey(threadId),
					getIssueDetailQueryKey(issueId),
					getIssueTimelineQueryKey(issueId),
					getSessionChatQueryKey(threadId),
					getSessionIssuesQueryKey(threadId),
					getHomeDashboardQueryKey(),
				])
					queryClient.invalidateQueries({ queryKey })
			},
		},
	})
	const { data: chat } = useGetSessionChat(threadId)
	const { data: artifacts } = useListArtifacts(threadId)
	const show = useDialogStore(state => state.show)

	const senders = useMemo(() => {
		const map = new Map<string, MessageSender>()
		for (const entry of chat?.transcript ?? []) {
			const name = entry.sender?.displayName
			if (name) map.set(entry.entryId, { name, initials: initialsOf(name) })
		}
		return map
	}, [chat])
	const artifactById = useMemo(() => new Map((artifacts?.artifacts ?? []).map(artifact => [artifact.artifactId, artifact])), [artifacts])

	const surface: TaskSurface = {
		// The answer IS the body's union (one option, or the person's words) — sent as is.
		answerAsk: (stopId, value) => answer.mutate({ stopId, data: value }),
		resolveStop: (stopId, resolution) => resolve.mutate({ stopId, data: { resolution } }),
		pending: answer.isPending || resolve.isPending,
		// The operator is on the desktop: every decision is theirs to answer.
		canRelease: true,
		canAct: true,
		answerTextSchema,
		senderOf: entryId => senders.get(entryId),
		openArtifact: artifactId => {
			const artifact = artifactById.get(artifactId)
			if (artifact) show(<ArtifactDialog artifact={artifact} threadId={threadId} />)
		},
		events: { issueId, publishOutput: true, renderBatchLink },
	}
	return <TaskSurfaceProvider value={surface}>{children}</TaskSurfaceProvider>
}

/** One artifact in the store-driven dialog — the same preview the artifacts tab renders. */
function ArtifactDialog({
	artifact,
	threadId,
	className,
	...props
}: ComponentProps<typeof DialogContent> & { artifact: Artifact; threadId: string }) {
	return (
		<DialogContent className={cn('max-w-3xl', className)} {...props}>
			<DialogHeader>
				<DialogTitle>{artifact.name}</DialogTitle>
			</DialogHeader>
			<ArtifactPreview artifact={artifact} threadId={threadId} />
		</DialogContent>
	)
}

/** The desktop's batch line: a link to the batch screen of this conversation (fase 4, item 5). Only a
 *  BATCH_LINKED item renders it, so the thread route is read only where there is a batch to link. */
const renderBatchLink: NonNullable<EventDetailCapabilities['renderBatchLink']> = (item, label) => (
	<BatchLink batchCode={item.batchCode}>{label}</BatchLink>
)

function BatchLink({ batchCode, className, children }: Pick<ComponentProps<'a'>, 'className' | 'children'> & { batchCode: string }) {
	const { threadId } = threadRoute.useParams()
	return (
		<Link
			to="/threads/$threadId/batches/$batchCode"
			params={{ threadId, batchCode }}
			className={cn('underline-offset-4 hover:underline', className)}
		>
			{children}
		</Link>
	)
}
