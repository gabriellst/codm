import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { useSignOut } from '@/lib/auth'

/**
 * Sign-out CTA at the bottom of the profile tab. Owns its own sign-out
 * action — no parent needs to wire it up.
 */
export function SignOutButton() {
	const { t } = useTranslation()
	const signOut = useSignOut()

	const handleSignOut = async () => {
		await signOut()
	}

	return (
		<View className="px-4 pt-4">
			<Button variant="ghost" fullWidth label={t('profile.signOut')} onPress={() => void handleSignOut()} />
		</View>
	)
}
