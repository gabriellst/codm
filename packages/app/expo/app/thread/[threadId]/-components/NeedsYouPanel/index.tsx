import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import {
	getHomeDashboardQueryKey,
	getNeedsYouPanelQueryKey,
	getSessionChatQueryKey,
	useGetNeedsYouPanel,
	useResolveStop,
} from '@codedm/client-typescript/typescript'
import type { GetNeedsYouPanelQueryResponse } from '@codedm/client-typescript/typescript'
import { Chip, ConsoleButton, ConsoleCard, resolutionIsPrimary, resolutionLabelKey, stopLabelKey } from '@/components/console'
import { LIVE_REFETCH_MS } from '@/lib/live'

type Stop = GetNeedsYouPanelQueryResponse['stops'][number]

/** Active stops on a thread with per-kind resolution actions. Renders nothing when clear. */
export function NeedsYouPanel({ threadId }: { threadId: string }) {
	const { t } = useTranslation()
	const { data } = useGetNeedsYouPanel(threadId, { query: { refetchInterval: LIVE_REFETCH_MS } })
	const stops = data?.stops ?? []
	if (stops.length === 0) return null

	return (
		<ConsoleCard padding="none" className="border-warning-border">
			<View className="flex-row items-center justify-between border-b border-border px-5 py-3">
				<View className="flex-row items-center gap-2">
					<Text className="font-sans-semi text-sm text-foreground">{t('session.needsYou')}</Text>
					<Text className="font-sans text-xs text-muted-foreground">{stops.length}</Text>
				</View>
				<Text className="font-sans text-xs text-muted-foreground">{t('session.agentStopped')}</Text>
			</View>
			<View>
				{stops.map((stop, i) => (
					<StopRow key={stop.stopId} threadId={threadId} stop={stop} first={i === 0} />
				))}
			</View>
		</ConsoleCard>
	)
}

function StopRow({ threadId, stop, first }: { threadId: string; stop: Stop; first: boolean }) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const resolve = useResolveStop()

	const onResolve = (resolution: Stop['availableResolutions'][number]) => {
		resolve.mutate(
			{ stopId: stop.stopId, data: { resolution } },
			{
				onSuccess: () => {
					queryClient.invalidateQueries({ queryKey: getNeedsYouPanelQueryKey(threadId) })
					queryClient.invalidateQueries({ queryKey: getSessionChatQueryKey(threadId) })
					queryClient.invalidateQueries({ queryKey: getHomeDashboardQueryKey() })
				},
			},
		)
	}

	return (
		<View className={`gap-3 px-5 py-3 ${first ? '' : 'border-t border-border'}`}>
			<View className="flex-row items-start gap-3">
				<Chip label={t(stopLabelKey(stop.kind))} />
				<View className="min-w-0 flex-1">
					<Text className="font-sans-medium text-sm text-foreground">{stop.title}</Text>
					<Text numberOfLines={2} className="font-sans text-xs text-muted-foreground">
						{stop.detail}
					</Text>
				</View>
				<Text className="font-sans text-xs text-muted-foreground">{stop.raisedAt}</Text>
			</View>
			<View className="flex-row flex-wrap gap-2">
				{stop.availableResolutions.map(resolution => (
					<ConsoleButton
						key={resolution}
						size="sm"
						variant={resolutionIsPrimary[resolution] ? 'primary' : 'outline'}
						label={t(resolutionLabelKey(resolution))}
						disabled={resolve.isPending}
						onPress={() => onResolve(resolution)}
					/>
				))}
			</View>
		</View>
	)
}
