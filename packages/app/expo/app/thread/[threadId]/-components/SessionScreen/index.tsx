import { ActivityIndicator, ScrollView, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useGetSessionChat } from '@codedm/client-typescript/typescript'
import { EmptyBlock, TranscriptBubble } from '@/components/console'
import { KeyboardAware } from '@/components/ui/KeyboardAware'
import { LIVE_REFETCH_MS } from '@/lib/live'
import { fg, surfaces } from '@/lib/tokens'
import { SessionHeader } from '../SessionHeader'
import { NeedsYouPanel } from '../NeedsYouPanel'
import { Composer } from '../Composer'

/**
 * The full thread session, pushed over the tab bar: header (identity +
 * control-plane state), active-stop resolution, the transcript, and the
 * mode-aware composer. Owns the session-chat read once and hands slices down;
 * polls for liveness (no SSE client on mobile).
 */
export function SessionScreen({ threadId }: { threadId: string }) {
	const { t } = useTranslation()
	const insets = useSafeAreaInsets()
	const { data, isLoading } = useGetSessionChat(threadId || undefined, {
		query: { enabled: !!threadId, refetchInterval: LIVE_REFETCH_MS },
	})

	if (!threadId) {
		return (
			<View className="flex-1 bg-route-background" style={{ paddingTop: insets.top + 24, paddingHorizontal: 20 }}>
				<EmptyBlock title={t('session.chatEmptyTitle')} body={t('session.chatEmptyBody')} />
			</View>
		)
	}

	return (
		<KeyboardAware
			dismissOnTap={false}
			keyboardVerticalOffset={0}
			style={{ backgroundColor: surfaces.bg0, paddingTop: insets.top }}
		>
			<ScrollView
				className="flex-1"
				keyboardShouldPersistTaps="handled"
				showsVerticalScrollIndicator={false}
				contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 16 }}
			>
				{isLoading && !data ? (
					<View className="items-center py-24">
						<ActivityIndicator color={fg.fg0} />
					</View>
				) : data ? (
					<>
						<SessionHeader
							threadId={threadId}
							thread={data.thread}
							paused={data.paused}
							autonomyCaption={data.autonomyCaption}
						/>
						<NeedsYouPanel threadId={threadId} />
						{data.transcript.length === 0 ? (
							<EmptyBlock title={t('session.chatEmptyTitle')} body={t('session.chatEmptyBody')} />
						) : (
							<View className="gap-4 py-1">
								{data.transcript.map(entry => (
									<TranscriptBubble key={entry.entryId} entry={entry} />
								))}
							</View>
						)}
					</>
				) : (
					<EmptyBlock title={t('session.chatEmptyTitle')} body={t('session.chatEmptyBody')} />
				)}
			</ScrollView>

			{data ? (
				<View style={{ paddingBottom: insets.bottom }}>
					<Composer threadId={threadId} composerMode={data.composerMode} />
				</View>
			) : null}
		</KeyboardAware>
	)
}
