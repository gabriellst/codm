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

	if (!antonLoaded || !montserratLoaded) return null

	return (
		<QueryClientProvider client={queryClient}>
			<StatusBar style="light" />
			<Stack
				screenOptions={{
					headerStyle: { backgroundColor: 'transparent' },
					headerTintColor: fg.fg0,
					contentStyle: { backgroundColor: surfaces.bg0 },
					animation: 'default',
				}}
			>
				<Stack.Screen name="index" options={{ headerShown: false }} />
				<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
				<Stack.Screen
					name="(sheets)/edit-profile"
					options={{
						presentation: 'fullScreenModal',
						headerShown: false,
						contentStyle: { backgroundColor: surfaces.surface1 },
						animation: 'slide_from_right',
					}}
				/>
				<Stack.Screen
					name="(sheets)/devices"
					options={{
						presentation: 'pageSheet',
						headerShown: false,
						sheetGrabberVisible: true,
						sheetAllowedDetents: [0.5, 0.95],
						sheetCornerRadius: 24,
						sheetExpandsWhenScrolledToEdge: false,
						contentStyle: { backgroundColor: surfaces.surface1 },
					}}
				/>
			</Stack>
		</QueryClientProvider>
	)
}
