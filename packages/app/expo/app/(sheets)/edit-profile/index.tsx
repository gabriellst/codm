import { Pressable, ScrollView, Text, View } from 'react-native'
import { Protected } from '@/components/Protected'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { IconChevron } from '@/components/ui/Icons'
import { KeyboardAware } from '@/components/ui/KeyboardAware'
import { accent, fg, iconSize, surfaces } from '@/lib/tokens'
import { useSignOut } from '@/lib/auth'

/**
 * Edit-profile sheet — boilerplate scaffold. Domain-specific form fields
 * (avatar / bio / visibility) ship in product features built on top of
 * this baseline; the shell here keeps settings rows + sign-out wired so
 * the route stays navigable from day one.
 */
export default function EditProfileSheet() {
	const { t } = useTranslation()
	const signOut = useSignOut()

	return (
		<Protected>
			<KeyboardAware style={{ backgroundColor: surfaces.surface1 }}>
				<ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
					<View className="px-5 pt-6 pb-4">
						<Eyebrow>{t('editProfile.sectionPersonal')}</Eyebrow>
					</View>
					<View className="px-5">
						<Text className="text-foreground-subtle font-sans text-sm mb-6">{t('editProfile.placeholder')}</Text>
					</View>

					<View className="px-5 pt-4 pb-3">
						<Eyebrow>{t('editProfile.sectionSettings')}</Eyebrow>
					</View>
					<View className="bg-popover mx-5 rounded-md overflow-hidden">
						<SettingsRow label={t('editProfile.rowDevices')} onPress={() => router.push('/(sheets)/devices')} isFirst isLast />
					</View>

					<View className="px-5 pt-6">
						<Pressable onPress={() => void signOut()} accessibilityRole="button" className="py-4 items-center">
							<Text style={{ color: accent.iosRed }} className="font-sans-semi text-base">
								{t('editProfile.rowSignOut')}
							</Text>
						</Pressable>
					</View>
				</ScrollView>
			</KeyboardAware>
		</Protected>
	)
}

function SettingsRow({ label, onPress, isFirst, isLast }: { label: string; onPress: () => void; isFirst?: boolean; isLast?: boolean }) {
	const borderTop = isFirst ? '' : 'border-t border-border-subtle'
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			style={({ pressed }) => ({
				backgroundColor: pressed ? surfaces.surface1 : 'transparent',
			})}
			className={`flex-row items-center justify-between px-4 py-4 ${borderTop} ${isLast ? '' : ''}`}
		>
			<Text className="text-foreground font-sans-semi text-base flex-1">{label}</Text>
			<IconChevron size={iconSize.lg} color={fg.fg2} />
		</Pressable>
	)
}
