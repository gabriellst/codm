import { Stack } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { LogoMark } from '@/components/ui/LogoMark'
import { fg, surfaces } from '@/lib/tokens'
import { headerLargeTitleStyle, headerTitleStyle } from '@/lib/screen-styles'

/**
 * Profile tab stack — Pattern A native nav (large title + transparent + blur).
 */
export default function ProfileTabLayout() {
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
					headerTitle: t('profile.navTitle'),
					headerLeft: () => <LogoMark />,
				}}
			/>
		</Stack>
	)
}
