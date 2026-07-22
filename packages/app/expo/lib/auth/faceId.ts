import * as LocalAuthentication from 'expo-local-authentication'
import i18n from '@/lib/i18n'

/**
 * Triggers a Face ID / Touch ID prompt. Returns true on success or when
 * the device has no biometric hardware/enrollment (fail-open in dev).
 *
 * Both the prompt and the fallback button label are translated via i18n
 * (`login.biometricPrompt` / `login.biometricFallback`). Callers that
 * already have a `t` instance in scope can pass localized strings directly.
 */
export async function authenticateWithBiometrics(promptMessage?: string, fallbackLabel?: string): Promise<boolean> {
	const [hasHardware, isEnrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()])
	if (!hasHardware || !isEnrolled) return true

	const result = await LocalAuthentication.authenticateAsync({
		promptMessage: promptMessage ?? i18n.t('login.biometricPrompt'),
		fallbackLabel: fallbackLabel ?? i18n.t('login.biometricFallback'),
		disableDeviceFallback: false,
	})
	return result.success
}
