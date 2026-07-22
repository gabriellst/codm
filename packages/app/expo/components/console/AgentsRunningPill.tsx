import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useGetHomeDashboard } from '@codedm/client-typescript/typescript'
import { LIVE_REFETCH_MS } from '@/lib/live'
import { Dot } from './StatusDot'

/**
 * The persistent operating pulse: how many agents are running right now. Owns
 * its own data and stays live by polling (no SSE client on mobile) — the count
 * refreshes on the shared dashboard read's `refetchInterval`.
 */
export function AgentsRunningPill() {
	const { t } = useTranslation()
	const { data } = useGetHomeDashboard({ query: { refetchInterval: LIVE_REFETCH_MS } })

	const count = data?.agentsRunningNow ?? 0
	const running = count > 0

	return (
		<View className="flex-row items-center gap-2 self-start rounded-pill bg-secondary px-3 py-1.5">
			<Dot className={running ? 'bg-success' : 'bg-muted-foreground'} />
			<Text className="font-sans-medium text-xs text-secondary-foreground">{t('console.agentsRunning', { count })}</Text>
		</View>
	)
}
