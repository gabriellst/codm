// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-expo-notifications-screen
// task:        synthetic-expo-notifications-screen
// stamp:       expo-notif-iter4s
// docTreeHash: c2250fc48222
// model:       sonnet
// graded:      2026-06-12T08:22:02.295Z
// source:      packages/app/expo/app/(tabs)/notifications/_layout.tsx (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
import { Stack } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { LogoMark } from '@/components/ui/LogoMark'
import { fg, surfaces } from '@/lib/tokens'
import { headerLargeTitleStyle, headerTitleStyle } from '@/lib/screen-styles'

export default function NotificationsTabLayout() {
	const { t } = useTranslation()
	return (
		<Stack
			screenOptions={{
				headerTransparent: true,
				headerStyle: { backgroundColor: 'transparent' },
				headerLargeStyle: { backgroundColor: 'transparent' },
				headerTintColor: fg.fg0,
				headerTitleStyle,
				headerLargeTitleStyle,
				contentStyle: { backgroundColor: surfaces.bg0 },
			}}
		>
			<Stack.Screen
				name="index"
				options={{
					headerShown: true,
					headerLargeTitle: true,
					headerTitle: t('notifications.navTitle'),
					headerLeft: () => <LogoMark />,
				}}
			/>
		</Stack>
	)
}
