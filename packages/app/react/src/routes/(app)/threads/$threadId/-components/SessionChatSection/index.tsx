import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useGetSessionChat } from '@codedm/client-typescript/typescript'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty'
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
		<div className={cn('flex flex-col h-full', className)} {...props}>
			<NeedsYouPanel threadId={threadId} />

			{data.transcript.length === 0 ? (
				<Empty className="py-16">
					<EmptyTitle>{t('session.chatEmptyTitle')}</EmptyTitle>
					<EmptyDescription>{t('session.chatEmptyDescription')}</EmptyDescription>
				</Empty>
			) : (
				<div className="flex flex-col gap-4 py-2 h-full">
					{data.transcript.map(entry => (
						<TranscriptBubble key={entry.entryId} entry={entry} threadId={threadId} />
					))}
				</div>
			)}

			<Composer threadId={threadId} composerMode={data.composerMode} />
		</div>
	)
}
