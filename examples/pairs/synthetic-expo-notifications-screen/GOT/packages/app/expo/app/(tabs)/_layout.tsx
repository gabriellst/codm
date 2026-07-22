// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-expo-notifications-screen
// task:        synthetic-expo-notifications-screen
// stamp:       expo-notif-iter4s
// docTreeHash: c2250fc48222
// model:       sonnet
// graded:      2026-06-12T08:22:02.295Z
// source:      packages/app/expo/app/(tabs)/_layout.tsx (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
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
					<NativeTabs.Trigger name="notifications">
						<NativeTabs.Trigger.Label>{t('tabs.notifications')}</NativeTabs.Trigger.Label>
						<NativeTabs.Trigger.Icon sf="bell.fill" />
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
