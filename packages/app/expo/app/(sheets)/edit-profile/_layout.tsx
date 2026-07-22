import { Pressable } from 'react-native'
import { Stack, router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { IconBack } from '@/components/ui/Icons'
import { fg, surfaces } from '@/lib/tokens'
import { headerTitleStyle } from '@/lib/screen-styles'

/**
 * Inner Stack with a back arrow + centered title. The parent Stack
 * registers this route as a fullScreenModal with no header — the visible
 * nav chrome lives here so `router.back()` is wired explicitly (iOS
 * fullScreenModals don't render a back arrow on their own).
 */
export default function EditProfileLayout() {
	const { t } = useTranslation()
	return (
		<Stack
			screenOptions={{
				headerShown: true,
				headerTitle: t('editProfile.title'),
				headerStyle: { backgroundColor: surfaces.surface1 },
				headerTintColor: fg.fg0,
				headerTitleStyle,
				headerLeft: () => (
					<Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={12}>
						<IconBack size={22} color={fg.fg0} />
					</Pressable>
				),
				contentStyle: { backgroundColor: surfaces.surface1 },
			}}
		/>
	)
}
