import * as SecureStore from 'expo-secure-store'

/**
 * First-run onboarding flag, persisted in expo-secure-store so the 3-slide
 * intro shows exactly once per install. Kept in SecureStore (not AsyncStorage)
 * to sit alongside the other operator-local client state (the daemon URL) —
 * CodeDM has no account, so this local flag is the only "have we met" signal.
 */
const ONBOARDING_SEEN_KEY = 'codedm:onboarding-seen'

export async function hasSeenOnboarding(): Promise<boolean> {
	try {
		return (await SecureStore.getItemAsync(ONBOARDING_SEEN_KEY)) === '1'
	} catch {
		return false
	}
}

export async function markOnboardingSeen(): Promise<void> {
	try {
		await SecureStore.setItemAsync(ONBOARDING_SEEN_KEY, '1')
	} catch {
		// A write failure just means the intro replays next launch — non-fatal.
	}
}

export async function resetOnboarding(): Promise<void> {
	try {
		await SecureStore.deleteItemAsync(ONBOARDING_SEEN_KEY)
	} catch {
		// non-fatal
	}
}
