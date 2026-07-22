import { Stack } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { LogoMark } from '@/components/ui/LogoMark'
import { fg, surfaces } from '@/lib/tokens'
import { headerTitleStyle } from '@/lib/screen-styles'

/**
 * Home tab stack — transparent + blur header.
 */
export default function HomeTabLayout() {
	const { t } = useTranslation()
	return (
		<Stack
			screenOptions={{
				headerTransparent: true,
				headerStyle: { backgroundColor: 'transparent' },
				headerTintColor: fg.fg0,
				headerTitleStyle,
				contentStyle: { backgroundColor: surfaces.bg0 },
			}}
		>
			<Stack.Screen
				name="index"
				options={{
					headerShown: true,
					headerTitle: t('tabs.home'),
					headerLargeTitle: false,
					headerLeft: () => <LogoMark />,
				}}
			/>
		</Stack>
	)
}
