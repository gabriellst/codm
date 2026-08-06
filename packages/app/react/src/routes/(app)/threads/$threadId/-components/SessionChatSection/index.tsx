import { type ComponentProps, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useGetSessionChat, useListArtifacts } from '@codm/client-typescript/typescript'
import type { GetSessionChatQueryResponse } from '@codm/client-typescript/typescript'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty'
import { VirtualList } from '@/components/ui/virtual-list'
import { cn } from '@/lib/utils'
import { NeedsYouPanel } from '../NeedsYouPanel'
import { TranscriptBubble } from '../TranscriptBubble'
import { TranscriptArtifact } from '../TranscriptArtifact'
import type { Artifact } from '../ArtifactPreview'
import { Composer } from '../Composer'

type Entry = GetSessionChatQueryResponse['transcript'][number]

/**
 * What a row of the conversation is, now that a conversation holds two kinds of fact.
 *
 * The union is composed HERE rather than shipped by the backend, and the reason is the context map:
 * `GetSessionChat` lives in `thread`, artifacts live in BC6, and BC6 already depends on `thread`
 * (`RecordArtifact` validates the thread through `ThreadRepository`). Growing the chat read model an
 * artifact list would invert that edge into a declared 2-cycle — permanent bidirectional coupling
 * between two contexts — to buy a sort by timestamp. So the two reads stay independent and the view
 * does the one thing a view is for.
 */
type TimelineItem =
	| { item: 'ENTRY'; key: string; at: string; entry: Entry }
	| { item: 'ARTIFACT'; key: string; at: string; artifact: Artifact }

/**
 * Interleave transcript and artifacts by time.
 *
 * The keys are PREFIXED by kind. The two ids are drawn from different sequences and the virtual list
 * caches measured heights BY KEY — two rows sharing a key would inherit each other's height.
 */
function buildTimeline(transcript: readonly Entry[], artifacts: readonly Artifact[]): TimelineItem[] {
	const items: TimelineItem[] = [
		...transcript.map(entry => ({ item: 'ENTRY' as const, key: `entry:${entry.entryId}`, at: entry.at, entry })),
		...artifacts.map(artifact => ({
			item: 'ARTIFACT' as const,
			key: `artifact:${artifact.artifactId}`,
			at: artifact.recordedAt,
			artifact,
		})),
	]
	// Both endpoints emit `toISOString()`, and ISO-8601 UTC sorts lexicographically exactly as it
	// sorts chronologically — so this needs no Date parsing per comparison.
	return items.sort((a, b) => a.at.localeCompare(b.at))
}

function TimelineRow({ item, threadId }: { item: TimelineItem; threadId: string }) {
	if (item.item === 'ENTRY') return <TranscriptBubble entry={item.entry} threadId={threadId} />
	if (item.item === 'ARTIFACT') return <TranscriptArtifact artifact={item.artifact} threadId={threadId} />
	// A third kind of row added to the union with no branch here is a tsc error, not a blank line.
	const exhaustive: never = item
	return exhaustive
}

/**
 * The full thread conversation (T09): needs-you panel, timeline, and the mode-aware composer.
 *
 * Owns its queries, not their freshness — `useThreadRealtime`, mounted by the `$threadId` layout,
 * holds the whole thread's invalidation policy, and it already invalidates BOTH keys this section
 * reads: `integration.artifact.recorded` staled the artifacts list before this change, and that list
 * is now part of what the conversation shows. This section used to subscribe to
 * `thread_status_changed` alone, which is why a new message never appeared: a message changes no
 * status.
 *
 * THE TIMELINE IS WINDOWED. `GetSessionChat` selects `transcriptEntries` for the thread with no
 * LIMIT, so the row count here is the AGE OF THE CONVERSATION — this is the console's one genuinely
 * unbounded list, and the `.map()` it used to be put one DOM subtree per entry on screen forever.
 *
 * WHICH SCROLLS, AND WHY IT MOVED. Windowing needs a scroll container with a definite height, so the
 * transcript now owns its own scroller instead of riding the app shell's. The visual contract is the
 * one that was already here — the chat fills the space it is given and scrolls inside itself — but
 * it now holds for a long transcript too: the composer and the needs-you callout stay put at the
 * edges instead of being pushed off the bottom by history. `min-h-0` is what allows the flex child
 * to be shorter than its content; without it the list would grow and the scroller would never engage.
 */
export function SessionChatSection({ threadId, className, ...props }: ComponentProps<'div'> & { threadId: string }) {
	const { t } = useTranslation()
	const { data, isLoading } = useGetSessionChat(threadId)
	const { data: artifactData } = useListArtifacts(threadId)

	const transcript = data?.transcript
	const artifacts = artifactData?.artifacts
	const timeline = useMemo(() => buildTimeline(transcript ?? [], artifacts ?? []), [transcript, artifacts])

	if (isLoading || !data) {
		return (
			<div className={cn('flex flex-col gap-4 py-4', className)} {...props}>
				<Skeleton className="h-16 w-2/3 rounded-2xl" />
				<Skeleton className="ml-auto h-16 w-2/3 rounded-2xl" />
				<Skeleton className="h-16 w-1/2 rounded-2xl" />
			</div>
		)
	}

	return (
		<div className={cn('flex min-h-0 grow flex-col', className)} {...props}>
			<NeedsYouPanel className={'shrink-0'} threadId={threadId} />

			{timeline.length === 0 ? (
				<Empty className="grow py-16">
					<EmptyTitle>{t('session.chatEmptyTitle')}</EmptyTitle>
					<EmptyDescription>{t('session.chatEmptyDescription')}</EmptyDescription>
				</Empty>
			) : (
				<VirtualList
					items={timeline}
					getItemKey={item => item.key}
					// A bubble is a caption, a body of wrapped text and a timestamp. This only seeds the
					// first paint; `measureElement` replaces it with the real height of every mounted row.
					estimatedItemHeight={88}
					className="grow py-2"
					// The `gap-4` this list used to get from its flex parent: inside a windowed list the
					// spacing has to be part of what a row MEASURES, or the measured heights and the
					// positions the virtualizer computes disagree by one gap per row.
					itemClassName="pb-4"
					renderItem={item => <TimelineRow item={item} threadId={threadId} />}
				/>
			)}

			<Composer threadId={threadId} composerMode={data.composerMode} />
		</div>
	)
}
