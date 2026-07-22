import { NativeTabs } from 'expo-router/unstable-native-tabs'
import { useTranslation } from 'react-i18next'
import { BiometricGate } from '@/components/BiometricGate'
import { Protected } from '@/components/Protected'
import { fg, font, fs } from '@/lib/tokens'

/**
 * Native iOS tab bar with a translucent dark "liquid glass" background.
 *
 * Wrapped with `<Protected>` so unauthenticated users redirect to login,
 * and `<BiometricGate>` so the authenticated area requires FaceID/TouchID
 * on cold start and after backgrounding. The login screen lives under
 * `(auth)/login` and is intentionally NOT gated.
 */
export default function TabLayout() {
	const { t } = useTranslation()

	return (
		<Protected>
			<BiometricGate>
				<NativeTabs
					blurEffect="systemUltraThinMaterialDark"
					backgroundColor="rgba(10,10,11,0.55)"
					tintColor={fg.fg0}
					labelStyle={{ fontFamily: font.sansBold, fontSize: fs.micro }}
				>
					<NativeTabs.Trigger name="home">
						<NativeTabs.Trigger.Label>{t('tabs.home')}</NativeTabs.Trigger.Label>
						<NativeTabs.Trigger.Icon sf="house.fill" />
					</NativeTabs.Trigger>
					<NativeTabs.Trigger name="profile">
						<NativeTabs.Trigger.Label>{t('tabs.profile')}</NativeTabs.Trigger.Label>
						<NativeTabs.Trigger.Icon sf="person.fill" />
					</NativeTabs.Trigger>
				</NativeTabs>
			</BiometricGate>
		</Protected>
	)
}
