import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, AppState, type AppStateStatus, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import * as SecureStore from 'expo-secure-store'
import { Lock } from 'lucide-react-native'
import { Button } from '@/components/ui/Button'
import { DisplayTitle } from '@/components/ui/DisplayTitle'
import { Text } from '@/components/ui/Text'
import { authenticateWithBiometrics } from '@/lib/auth'
import { fg, surfaces } from '@/lib/tokens'

const BIOMETRIC_PREF_KEY = 'monorepo:biometric-required'

/**
 * Mark the authenticated area as biometric-gated. Persisted in SecureStore
 * so the preference survives app restarts independent of the session.
 */
export async function setBiometricRequired(required: boolean): Promise<void> {
	if (required) await SecureStore.setItemAsync(BIOMETRIC_PREF_KEY, '1')
	else await SecureStore.deleteItemAsync(BIOMETRIC_PREF_KEY)
}

/** Read the persisted preference. Defaults to "required" so the gate is opt-out. */
export async function isBiometricRequired(): Promise<boolean> {
	const value = await SecureStore.getItemAsync(BIOMETRIC_PREF_KEY)
	// Treat missing key as "required" — biometric protection is the default for
	// the authenticated area; users explicitly opt out via settings.
	return value !== '0'
}

type BiometricGateProps = { children: React.ReactNode }

/**
 * Wraps the authenticated area with a FaceID / TouchID gate. The gate
 * triggers:
 *   - on first mount (cold start into the tabs),
 *   - when the app returns to the foreground after being backgrounded.
 *
 * On hardware/enrollment failure the gate falls open (matches the existing
 * `authenticateWithBiometrics` semantics — dev-friendly, no lockout in
 * simulators without enrolled biometrics).
 */
export function BiometricGate({ children }: BiometricGateProps) {
	const { t } = useTranslation()
	const [unlocked, setUnlocked] = useState(false)
	const [checking, setChecking] = useState(true)
	const previousState = useRef<AppStateStatus>(AppState.currentState)

	const attemptUnlock = useCallback(async () => {
		setChecking(true)
		const required = await isBiometricRequired()
		if (!required) {
			setUnlocked(true)
			setChecking(false)
			return
		}
		const ok = await authenticateWithBiometrics(t('biometricGate.prompt'), t('biometricGate.fallback'))
		setUnlocked(ok)
		setChecking(false)
	}, [t])

	useEffect(() => {
		void attemptUnlock()
	}, [attemptUnlock])

	// Re-lock when app returns from background. Authenticated → background → foreground
	// should re-prompt; foreground → background → foreground within a few seconds
	// would be a UX nit we can address later with a grace window.
	useEffect(() => {
		const subscription = AppState.addEventListener('change', next => {
			if (previousState.current.match(/inactive|background/) && next === 'active') {
				setUnlocked(false)
				void attemptUnlock()
			}
			previousState.current = next
		})
		return () => subscription.remove()
	}, [attemptUnlock])

	if (checking && !unlocked) {
		return (
			<View className="flex-1 items-center justify-center" style={{ backgroundColor: surfaces.bg0 }}>
				<ActivityIndicator color={fg.fg0} />
			</View>
		)
	}

	if (!unlocked) {
		return (
			<View className="flex-1 items-center justify-center px-8 gap-6" style={{ backgroundColor: surfaces.bg0 }}>
				<Lock color={fg.fg0} size={48} />
				<DisplayTitle fontSize={28} className="text-center">
					{t('biometricGate.title')}
				</DisplayTitle>
				<Text className="text-center max-w-[280px]">{t('biometricGate.body')}</Text>
				<Button label={t('biometricGate.cta')} onPress={() => void attemptUnlock()} />
			</View>
		)
	}

	return <>{children}</>
}
