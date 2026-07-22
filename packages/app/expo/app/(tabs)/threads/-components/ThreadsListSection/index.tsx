import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { router } from 'expo-router'
import { ChevronRight } from 'lucide-react-native'
import { useGetHomeDashboard } from '@codedm/client-typescript/typescript'
import {
	EmptyBlock,
	ListCard,
	ListRow,
	PageHeader,
	ScrollScreen,
	StatusChip,
	ThreadAvatar,
} from '@/components/console'
import { LIVE_REFETCH_MS } from '@/lib/live'
import { fg } from '@/lib/tokens'

/**
 * The threads list — every contact/group with an agent attached and currently
 * active. There is no dedicated "list all threads" read in the SDK, so this
 * mirrors the react console's rail: the dashboard's `activeSessions` are the
 * threads, polled for liveness. Rows open the full session over the tabs.
 */
export function ThreadsListSection() {
	const { t } = useTranslation()
	const { data, isLoading } = useGetHomeDashboard({ query: { refetchInterval: LIVE_REFETCH_MS } })
	const threads = data?.activeSessions ?? []

	return (
		<ScrollScreen>
			<PageHeader
				title={t('threadsList.title')}
				subtitle={<Text className="font-sans text-sm text-muted-foreground">{t('threadsList.subtitle')}</Text>}
			/>

			{isLoading && !data ? (
				<View className="items-center py-16">
					<ActivityIndicator color={fg.fg0} />
				</View>
			) : threads.length === 0 ? (
				<EmptyBlock title={t('threadsList.emptyTitle')} body={t('threadsList.emptyBody')} />
			) : (
				<ListCard>
					{threads.map((thread, i) => (
						<Pressable
							key={thread.threadId}
							onPress={() => router.push(`/thread/${thread.threadId}`)}
							style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
						>
							<ListRow first={i === 0}>
								<ThreadAvatar name={thread.displayName} channelKind={thread.channelKind} />
								<View className="min-w-0 flex-1">
									<Text numberOfLines={1} className="font-sans-medium text-sm text-foreground">
										{thread.displayName}
									</Text>
									<Text numberOfLines={1} className="font-sans text-xs text-muted-foreground">
										{thread.workspacePath}
									</Text>
								</View>
								<StatusChip status={thread.status} />
								<ChevronRight size={16} color={fg.fg2} strokeWidth={2} />
							</ListRow>
						</Pressable>
					))}
				</ListCard>
			)}
		</ScrollScreen>
	)
}
