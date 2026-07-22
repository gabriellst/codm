import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Pause, Play } from 'lucide-react-native'
import {
	getHomeDashboardQueryKey,
	getSessionChatQueryKey,
	usePauseThread,
	useResumeThread,
} from '@codedm/client-typescript/typescript'
import type { GetSessionChatQueryResponse } from '@codedm/client-typescript/typescript'
import { ConsoleButton, StatusChip, ThreadAvatar, channelLabelKey, providerGlyph, providerLabelKey } from '@/components/console'
import { DisplayTitle } from '@/components/ui/DisplayTitle'
import { fg } from '@/lib/tokens'

type Thread = GetSessionChatQueryResponse['thread']

/** The session masthead: back, identity, providers, control-plane state, pause/resume. */
export function SessionHeader({
	threadId,
	thread,
	paused,
	autonomyCaption,
}: {
	threadId: string
	thread: Thread
	paused: boolean
	autonomyCaption: string
}) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const pause = usePauseThread()
	const resume = useResumeThread()

	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: getSessionChatQueryKey(threadId) })
		queryClient.invalidateQueries({ queryKey: getHomeDashboardQueryKey() })
	}

	return (
		<View className="gap-4">
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={t('console.back')}
				hitSlop={8}
				onPress={() => router.back()}
				className="h-10 w-10 items-center justify-center rounded-pill bg-secondary"
				style={({ pressed }) => (pressed ? { opacity: 0.8 } : undefined)}
			>
				<ChevronLeft size={20} color={fg.fg0} strokeWidth={2} />
			</Pressable>

			<View className="flex-row items-center gap-3">
				<ThreadAvatar name={thread.displayName} channelKind={thread.channelKind} size="lg" />
				<View className="flex-1">
					<DisplayTitle fontSize={26}>{thread.displayName}</DisplayTitle>
					<Text numberOfLines={1} className="font-mono text-xs text-muted-foreground">
						{t(channelLabelKey(thread.channelKind))} · {thread.workspacePath}
					</Text>
				</View>
			</View>

			<View className="flex-row flex-wrap items-center gap-2">
				{thread.providers.map(provider => {
					const Glyph = providerGlyph[provider]
					return (
						<View key={provider} className="flex-row items-center gap-1.5 rounded-pill border border-border px-3 py-1">
							<Glyph size={14} color={fg.fg0} strokeWidth={2} />
							<Text className="font-sans-medium text-xs text-foreground">{t(providerLabelKey(provider))}</Text>
						</View>
					)
				})}
				<StatusChip status={thread.status} />
				{paused ? (
					<ConsoleButton
						size="sm"
						variant="outline"
						label={t('session.resume')}
						loading={resume.isPending}
						leading={<Play size={14} color={fg.fg0} strokeWidth={2} />}
						onPress={() => resume.mutate({ threadId }, { onSuccess: invalidate })}
					/>
				) : (
					<ConsoleButton
						size="sm"
						variant="outline"
						label={t('session.pause')}
						loading={pause.isPending}
						leading={<Pause size={14} color={fg.fg0} strokeWidth={2} />}
						onPress={() => pause.mutate({ threadId }, { onSuccess: invalidate })}
					/>
				)}
			</View>

			<Text className="font-sans text-xs text-muted-foreground">{autonomyCaption}</Text>
		</View>
	)
}
