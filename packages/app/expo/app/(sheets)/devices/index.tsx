import { Pressable, Text, View } from 'react-native'
import { Protected } from '@/components/Protected'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { IconClose } from '@/components/ui/Icons'
import { fg, fs } from '@/lib/tokens'

/**
 * Devices sheet — opened from the Edit Profile "Devices" row. Boilerplate
 * placeholder; product features wire this to a list of registered push
 * devices once the SDK exposes them.
 *
 * Dismissal is explicit (`router.back()` — pageSheet) per sheet SHT-P02:
 * the iOS grabber is not cross-platform, so every sheet ships its own
 * close affordance.
 */
export default function DevicesSheet() {
	const { t } = useTranslation()

	return (
		<Protected>
			<View className="flex-1 px-5 pt-4 pb-6">
				<View className="flex-row items-center justify-between mb-2">
					<View className="w-6" />
					<Text className="text-foreground font-sans-bold text-center" style={{ fontSize: fs.headerTitle }}>
						{t('profile.eyebrows.devices')}
					</Text>
					<Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('common.close')} hitSlop={12}>
						<IconClose size={20} color={fg.fg1} />
					</Pressable>
				</View>
				<Text className="text-foreground-subtle text-sm text-center mt-10">{t('profile.devices.empty')}</Text>
			</View>
		</Protected>
	)
}
