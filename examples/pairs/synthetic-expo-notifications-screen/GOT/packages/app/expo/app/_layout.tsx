// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-expo-notifications-screen
// task:        synthetic-expo-notifications-screen
// stamp:       expo-notif-iter4s
// docTreeHash: c2250fc48222
// model:       sonnet
// graded:      2026-06-12T08:22:02.295Z
// source:      packages/app/expo/app/_layout.tsx (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
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

	// Session hydration is owned by `@better-auth/expo` + `auth.useSession()`.
	// Routes call `useSession()` to read the cached state and redirect on 401,
	// so the splash gate only needs to wait for fonts.
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
				<Stack.Screen name="(auth)/login" options={{ headerShown: false, animation: 'fade' }} />
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
				<Stack.Screen
					name="(sheets)/notification-detail"
					options={{
						presentation: 'pageSheet',
						headerShown: false,
						sheetGrabberVisible: true,
						sheetAllowedDetents: [0.75, 0.95],
						sheetCornerRadius: 24,
						sheetExpandsWhenScrolledToEdge: false,
						contentStyle: { backgroundColor: surfaces.surface1 },
					}}
				/>
			</Stack>
		</QueryClientProvider>
	)
}
