import { ScrollView, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Avatar } from '@/components/ui/Avatar'
import { Text } from '@/components/ui/Text'
import { avatarInitialFor, useCurrentUser } from '@/lib/auth'

/**
 * Minimal profile tab — avatar + display name. Domain-specific sections
 * (devices, lifetime stats, session grid, etc.) live behind the product
 * feature work, not in the boilerplate baseline.
 */
export default function ProfileTab() {
	const { t } = useTranslation()
	const user = useCurrentUser()

	return (
		<View className="flex-1 bg-background">
			<ScrollView
				contentContainerStyle={{ paddingBottom: 110, paddingTop: 24, paddingHorizontal: 20, gap: 16 }}
				contentInsetAdjustmentBehavior="automatic"
				showsVerticalScrollIndicator={false}
				className="flex-1"
			>
				<View className="items-center gap-3">
					<Avatar initial={avatarInitialFor(user)} size="lg" />
					<Text variant="title">{user?.name ?? t('profile.guest')}</Text>
					{user?.email ? <Text variant="caption">{user.email}</Text> : null}
				</View>
			</ScrollView>
		</View>
	)
}
