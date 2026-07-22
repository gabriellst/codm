import { NativeTabs } from 'expo-router/unstable-native-tabs'
import { useTranslation } from 'react-i18next'
import { useNeedsYouBadge } from '@/lib/notifications'
import { fg, font, fs } from '@/lib/tokens'

/**
 * The CodeDM operator tab bar — a light "liquid glass" bar over the monochrome
 * console. No auth gate: CodeDM is a single-operator local daemon (founder
 * decisions 1 & 2), so there is no `<Protected>` / biometric wrapper here.
 *
 * Mounting the tabs also drives the native "needs you" surfacing — the app-icon
 * badge tracks how many threads currently need the operator (expo-notifications,
 * local only, no push service).
 */
export default function TabLayout() {
	const { t } = useTranslation()
	useNeedsYouBadge()

	return (
		<NativeTabs
			blurEffect="systemChromeMaterialLight"
			backgroundColor="rgba(246,246,246,0.85)"
			tintColor={fg.fg0}
			labelStyle={{ fontFamily: font.sansSemi, fontSize: fs.micro }}
		>
			<NativeTabs.Trigger name="home">
				<NativeTabs.Trigger.Label>{t('tabs.home')}</NativeTabs.Trigger.Label>
				<NativeTabs.Trigger.Icon sf="house.fill" />
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="threads">
				<NativeTabs.Trigger.Label>{t('tabs.threads')}</NativeTabs.Trigger.Label>
				<NativeTabs.Trigger.Icon sf="bubble.left.and.bubble.right.fill" />
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="issues">
				<NativeTabs.Trigger.Label>{t('tabs.issues')}</NativeTabs.Trigger.Label>
				<NativeTabs.Trigger.Icon sf="list.bullet" />
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="channels">
				<NativeTabs.Trigger.Label>{t('tabs.channels')}</NativeTabs.Trigger.Label>
				<NativeTabs.Trigger.Icon sf="dot.radiowaves.left.and.right" />
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="settings">
				<NativeTabs.Trigger.Label>{t('tabs.settings')}</NativeTabs.Trigger.Label>
				<NativeTabs.Trigger.Icon sf="gearshape.fill" />
			</NativeTabs.Trigger>
		</NativeTabs>
	)
}
