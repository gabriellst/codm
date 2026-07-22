import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { getSessionChatQueryKey, useGetSessionChat } from '@codedm/client-typescript/typescript'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty'
import { useServerEvents } from '@/hooks'
import { NeedsYouPanel } from '../NeedsYouPanel'
import { TranscriptBubble } from '../TranscriptBubble'
import { Composer } from '../Composer'

/** The full thread conversation (T09): needs-you panel, transcript, and the mode-aware composer. */
export function SessionChatSection({ threadId }: { threadId: string }) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const { data, isLoading } = useGetSessionChat(threadId)

	useServerEvents('browser.thread_status_changed', event => {
		if (event.threadId === threadId) queryClient.invalidateQueries({ queryKey: getSessionChatQueryKey(threadId) })
	})

	if (isLoading || !data) {
		return (
			<div className="flex flex-col gap-4 py-4">
				<Skeleton className="h-16 w-2/3 rounded-2xl" />
				<Skeleton className="ml-auto h-16 w-2/3 rounded-2xl" />
				<Skeleton className="h-16 w-1/2 rounded-2xl" />
			</div>
		)
	}

	return (
		<div className="flex flex-col">
			<NeedsYouPanel threadId={threadId} />

			{data.transcript.length === 0 ? (
				<Empty className="py-16">
					<EmptyTitle>{t('session.chatEmptyTitle')}</EmptyTitle>
					<EmptyDescription>{t('session.chatEmptyDescription')}</EmptyDescription>
				</Empty>
			) : (
				<div className="flex flex-col gap-4 py-2">
					{data.transcript.map(entry => (
						<TranscriptBubble key={entry.entryId} entry={entry} threadId={threadId} />
					))}
				</div>
			)}

			<Composer threadId={threadId} composerMode={data.composerMode} />
		</div>
	)
}
