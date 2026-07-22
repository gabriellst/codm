import '../global.css'
import { useEffect } from 'react'
import * as SplashScreen from 'expo-splash-screen'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Anton_400Regular, useFonts as useAntonFonts } from '@expo-google-fonts/anton'
import {
	Montserrat_400Regular,
	Montserrat_500Medium,
	Montserrat_600SemiBold,
	Montserrat_700Bold,
	Montserrat_800ExtraBold,
	useFonts as useMontserratFonts,
} from '@expo-google-fonts/montserrat'
import { initApiClient } from '@/lib/api'
import { applyStoredDaemonUrl } from '@/lib/daemon'
import { handleApiError } from '@/lib'
import { fg, surfaces } from '@/lib/tokens'
import '@/lib/i18n'

SplashScreen.preventAutoHideAsync().catch(() => undefined)

initApiClient()

const queryClient = new QueryClient({
	queryCache: new QueryCache({
		onError: error => handleApiError(error),
	}),
	mutationCache: new MutationCache({
		onError: error => handleApiError(error),
	}),
	defaultOptions: {
		queries: {
			staleTime: 30_000,
			retry: 1,
			throwOnError: false,
		},
	},
})

export default function RootLayout() {
	const [antonLoaded] = useAntonFonts({ Anton_400Regular })
	const [montserratLoaded] = useMontserratFonts({
		Montserrat_400Regular,
		Montserrat_500Medium,
		Montserrat_600SemiBold,
		Montserrat_700Bold,
		Montserrat_800ExtraBold,
	})

	// CodeDM has no accounts: `auth.useSession()` is a constant single-operator stub with no
	// round-trip to hydrate, so there is no session gate — the splash only waits for fonts.
	useEffect(() => {
		if (antonLoaded && montserratLoaded) {
			SplashScreen.hideAsync().catch(() => undefined)
		}
	}, [antonLoaded, montserratLoaded])

	// Re-point the SDK client at the operator's stored daemon URL (SecureStore) once the
	// async read resolves; the synchronous default in initApiClient() covers the first frame.
	useEffect(() => {
		void applyStoredDaemonUrl()
	}, [])

	if (!antonLoaded || !montserratLoaded) return null

	return (
		<QueryClientProvider client={queryClient}>
			<StatusBar style="dark" />
			<Stack
				screenOptions={{
					headerShown: false,
					headerStyle: { backgroundColor: 'transparent' },
					headerTintColor: fg.fg0,
					contentStyle: { backgroundColor: surfaces.bg0 },
					animation: 'default',
				}}
			>
				<Stack.Screen name="index" />
				<Stack.Screen name="onboarding" />
				<Stack.Screen name="(tabs)" />
				<Stack.Screen name="thread/[threadId]" />
				<Stack.Screen name="issue/[issueId]" />
			</Stack>
		</QueryClientProvider>
	)
}
