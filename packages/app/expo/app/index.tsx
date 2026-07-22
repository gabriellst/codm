import { Redirect } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { useSession } from '@/lib/auth'
import { fg } from '@/lib/tokens'

export default function Index() {
	const { isLoading, isAuthenticated } = useSession()

	if (isLoading) {
		return (
			<View className="flex-1 items-center justify-center bg-background">
				<ActivityIndicator color={fg.fg0} />
			</View>
		)
	}

	return <Redirect href={isAuthenticated ? '/(tabs)/home' : '/(auth)/login'} />
}
