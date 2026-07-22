import { ActivityIndicator, View } from 'react-native'
import { useGetSetupChecklist } from '@codedm/client-typescript/typescript'
import { ScrollScreen } from '@/components/console'
import { LIVE_REFETCH_MS } from '@/lib/live'
import { fg } from '@/lib/tokens'
import { SetupChecklist } from '../SetupChecklist'
import { HomeDashboard } from '../HomeDashboard'

/**
 * Home is a fork: until the operator has attached at least one thread it shows
 * the three-step setup checklist; once a thread exists it becomes the operating
 * dashboard. The checklist read owns that decision and polls for liveness.
 */
export function HomeSection() {
	const { data, isLoading } = useGetSetupChecklist({ query: { refetchInterval: LIVE_REFETCH_MS } })

	if (isLoading || !data) {
		return (
			<ScrollScreen>
				<View className="items-center py-24">
					<ActivityIndicator color={fg.fg0} />
				</View>
			</ScrollScreen>
		)
	}

	return data.threadDone ? <HomeDashboard /> : <SetupChecklist checklist={data} />
}
