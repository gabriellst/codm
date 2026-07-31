import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useGetSessionChat } from '@codm/client-typescript/typescript'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty'
import { VirtualList } from '@/components/ui/virtual-list'
import { cn } from '@/lib/utils'
import { NeedsYouPanel } from '../NeedsYouPanel'
import { TranscriptBubble } from '../TranscriptBubble'
import { Composer } from '../Composer'

/**
 * The full thread conversation (T09): needs-you panel, transcript, and the mode-aware composer.
 *
 * Owns its query, not its freshness — `useThreadRealtime`, mounted by the `$threadId` layout, holds
 * the whole thread's invalidation policy. This section used to subscribe to `thread_status_changed`
 * alone, which is why a new message never appeared: a message changes no status.
 *
 * THE TRANSCRIPT IS WINDOWED. `GetSessionChat` selects `transcriptEntries` for the thread with no
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
			<NeedsYouPanel threadId={threadId} />

			{data.transcript.length === 0 ? (
				<Empty className="grow py-16">
					<EmptyTitle>{t('session.chatEmptyTitle')}</EmptyTitle>
					<EmptyDescription>{t('session.chatEmptyDescription')}</EmptyDescription>
				</Empty>
			) : (
				<VirtualList
					items={data.transcript}
					getItemKey={entry => entry.entryId}
					// A bubble is a caption, a body of wrapped text and a timestamp. This only seeds the
					// first paint; `measureElement` replaces it with the real height of every mounted row.
					estimatedItemHeight={88}
					className="grow py-2"
					// The `gap-4` this list used to get from its flex parent: inside a windowed list the
					// spacing has to be part of what a row MEASURES, or the measured heights and the
					// positions the virtualizer computes disagree by one gap per row.
					itemClassName="pb-4"
					renderItem={entry => <TranscriptBubble entry={entry} threadId={threadId} />}
				/>
			)}

			<Composer threadId={threadId} composerMode={data.composerMode} />
		</div>
	)
}
