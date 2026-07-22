import { useEffect, useRef, useState } from 'react'
import { Alert, Animated, Easing, Platform, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { useTranslation } from 'react-i18next'
import * as AppleAuthentication from 'expo-apple-authentication'
import { Button } from '@/components/ui/Button'
import { StripePattern } from '@/components/ui/StripePattern'
import { DisplayTitle } from '@/components/ui/DisplayTitle'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { gradients, fs, surfaces } from '@/lib/tokens'
import { auth, authenticateWithBiometrics } from '@/lib/auth'
import { tryCatchAsync } from '@/lib'

const FADE_UP_DURATION = 620
const FADE_UP_OFFSET = 16
const SPIN_DURATION = 3200
const EASE_OUT_QUINT = Easing.out(Easing.poly(5))
const EASE_IN_OUT_QUINT = Easing.inOut(Easing.poly(5))

/**
 * Entrance animation primitive — `opacity 0→1` + `translateY 16→0`,
 * eased with quintic ease-out so the motion settles softly. Each
 * element gets its own delay to stagger the reveal down the screen.
 */
function useFadeUp(delay: number) {
	const value = useRef(new Animated.Value(0)).current
	useEffect(() => {
		Animated.timing(value, {
			toValue: 1,
			duration: FADE_UP_DURATION,
			delay,
			easing: EASE_OUT_QUINT,
			useNativeDriver: true,
		}).start()
	}, [value, delay])
	return {
		opacity: value,
		transform: [
			{
				translateY: value.interpolate({
					inputRange: [0, 1],
					outputRange: [FADE_UP_OFFSET, 0],
				}),
			},
		],
	}
}

/**
 * Continuous 360° rotation eased with quintic ease-in-out so each lap
 * accelerates from rest, glides through the middle, and decelerates
 * before the seamless wrap.
 */
function useSpin() {
	const value = useRef(new Animated.Value(0)).current
	useEffect(() => {
		const loop = Animated.loop(
			Animated.timing(value, {
				toValue: 1,
				duration: SPIN_DURATION,
				easing: EASE_IN_OUT_QUINT,
				useNativeDriver: true,
			}),
		)
		loop.start()
		return () => loop.stop()
	}, [value])
	return {
		transform: [
			{
				rotate: value.interpolate({
					inputRange: [0, 1],
					outputRange: ['0deg', '360deg'],
				}),
			},
		],
	}
}

export default function LoginScreen() {
	const { t } = useTranslation()
	const [busy, setBusy] = useState(false)

	const logoAnim = useFadeUp(0)
	const eyebrowAnim = useFadeUp(80)
	const titleAnim = useFadeUp(160)
	const taglineAnim = useFadeUp(240)
	const primaryAnim = useFadeUp(320)
	const secondaryAnim = useFadeUp(400)
	const legalAnim = useFadeUp(480)
	const spinStyle = useSpin()

	const handleAppleSignIn = async () => {
		if (busy) return
		setBusy(true)
		const result = await tryCatchAsync(async () => {
			// 1) Native Apple Sign-In returns an identity token signed by Apple.
			const credential = await AppleAuthentication.signInAsync({
				requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
			})
			if (!credential.identityToken) throw new Error('Apple did not return an identity token')

			// 2) Hand the token to better-auth — it verifies via Apple's JWKS,
			//    creates/updates the user, and persists the session cookie via
			//    the Expo plugin's SecureStore. Apple only returns `fullName`/
			//    `email` on the first sign-in (and only when the user hasn't
			//    revoked the app), so forward them here so better-auth has them.
			const { error } = await auth.signIn.social({
				provider: 'apple',
				idToken: {
					token: credential.identityToken,
					user: credential.fullName
						? {
								name: {
									firstName: credential.fullName.givenName ?? undefined,
									lastName: credential.fullName.familyName ?? undefined,
								},
								email: credential.email ?? undefined,
							}
						: undefined,
				},
			})
			if (error) throw new Error(error.message ?? 'Sign-in failed')

			// 3) Cookie is now in SecureStore. better-auth's reactive session
			//    store will pick it up on the next render of `auth.useSession()`.
		})
		if (!result.success) {
			const code = (result.error as { code?: string } | null)?.code
			if (code !== 'ERR_REQUEST_CANCELED' && code !== 'ERR_CANCELED') {
				Alert.alert(t('errors.title'), result.error.message ?? t('errors.UNKNOWN_ERROR'))
			}
			setBusy(false)
			return
		}
		router.replace('/(tabs)/home')
		setBusy(false)
	}

	const handleAlreadyMember = async () => {
		if (busy) return
		setBusy(true)
		const ok = await authenticateWithBiometrics(t('login.biometricPrompt'), t('login.biometricFallback'))
		if (!ok) {
			setBusy(false)
			return
		}
		// Force better-auth to validate the SecureStore cookie against the API
		// before navigating so we surface a meaningful error if the session was
		// revoked server-side.
		const result = await tryCatchAsync(() => auth.getSession())
		if (result.success && result.data?.data?.user) {
			router.replace('/(tabs)/home')
		} else {
			Alert.alert(t('errors.title'), t('login.errors.appleFirst'))
		}
		setBusy(false)
	}

	const isAppleAvailable = Platform.OS === 'ios'

	return (
		<View style={{ flex: 1, backgroundColor: surfaces.bg0 }}>
			<StripePattern strength={0.7} />
			<LinearGradient
				colors={gradients.loginGlow}
				start={{ x: 0.5, y: 0 }}
				end={{ x: 0.5, y: 0.55 }}
				style={StyleSheet.absoluteFill}
				pointerEvents="none"
			/>

			<SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
				<View className="flex-1 items-center justify-center px-6 py-9">
					<Animated.Image
						source={require('@/assets/logo-mark-white.webp')}
						style={[{ width: 92, height: 92, marginBottom: 24 }, logoAnim]}
						resizeMode="contain"
					/>

					<Animated.View style={eyebrowAnim} className="mb-3.5 flex-row items-center gap-1.5">
						<Animated.Text className="font-sans-bold uppercase text-foreground" style={[{ fontSize: 14 }, spinStyle]}>
							✦
						</Animated.Text>
						<Eyebrow tone="strong" tracking="tight">
							{t('login.eyebrow')}
						</Eyebrow>
						<Animated.Text className="font-sans-bold uppercase text-foreground" style={[{ fontSize: 14 }, spinStyle]}>
							✦
						</Animated.Text>
					</Animated.View>

					<Animated.View style={titleAnim} className="items-center mb-3.5">
						<DisplayTitle fontSize={fs.display1} className="text-center">
							{t('login.title')}
						</DisplayTitle>
					</Animated.View>

					<Animated.Text
						className="font-sans text-center mb-7 max-w-[320px] text-muted-foreground"
						style={[{ fontSize: 14.5, lineHeight: 22.5 }, taglineAnim]}
					>
						{t('login.tagline')}
					</Animated.Text>

					{isAppleAvailable ? (
						<Animated.View style={primaryAnim} className="w-full max-w-[340px] mb-2.5">
							<AppleAuthentication.AppleAuthenticationButton
								buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
								buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
								cornerRadius={9999}
								style={{ width: '100%', height: 52 }}
								onPress={() => void handleAppleSignIn()}
							/>
						</Animated.View>
					) : (
						<Animated.View style={primaryAnim} className="w-full max-w-[340px] mb-2.5">
							<Button label={t('login.cta')} fullWidth onPress={() => void handleAppleSignIn()} disabled={busy} />
						</Animated.View>
					)}

					<Animated.View style={secondaryAnim} className="w-full max-w-[340px]">
						<Button variant="ghost" label={t('login.alreadyMember')} fullWidth onPress={() => void handleAlreadyMember()} disabled={busy} />
					</Animated.View>

					<Animated.Text className="font-sans text-[11px] mt-7 text-center text-foreground-subtle" style={legalAnim}>
						{t('login.legal')}
					</Animated.Text>
				</View>
			</SafeAreaView>
		</View>
	)
}
