import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowRight } from 'lucide-react-native'
import {
	CHANNEL_KINDS,
	ConsoleButton,
	PROVIDER_KINDS,
	channelGlyph,
	providerGlyph,
} from '@/components/console'
import { DisplayTitle } from '@/components/ui/DisplayTitle'
import { markOnboardingSeen } from '@/lib/onboarding'
import { action, border, fg } from '@/lib/tokens'

/** First-run intro: value prop, how it works, and the control plane — 3 slides. */
export function OnboardingSlides() {
	const { t } = useTranslation()
	const insets = useSafeAreaInsets()
	const [slide, setSlide] = useState(0)

	const finish = async () => {
		await markOnboardingSeen()
		router.replace('/(tabs)/home')
	}

	return (
		<View className="flex-1 bg-route-background" style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}>
			<View className="flex-row items-center justify-between px-6 py-4">
				<Text className="font-sans-black text-base text-foreground">CodeDM</Text>
				<Pressable onPress={finish} hitSlop={8}>
					<Text className="font-sans-semi text-sm text-foreground">{t('onboarding.skip')}</Text>
				</Pressable>
			</View>

			<View className="flex-1 items-center justify-center px-8">
				<View className="w-full max-w-md items-center gap-8">
					{slide === 0 && <ValueSlide />}
					{slide === 1 && <HowItWorksSlide />}
					{slide === 2 && <ControlSlide />}

					<View className="flex-row items-center gap-2">
						{[0, 1, 2].map(i => (
							<View
								key={i}
								className="h-2 w-2 rounded-pill"
								style={{ backgroundColor: i === slide ? action.primary : border.border }}
							/>
						))}
					</View>
				</View>
			</View>

			<View className="flex-row items-center justify-center gap-3 px-8">
				{slide > 0 ? (
					<ConsoleButton variant="outline" label={t('onboarding.back')} onPress={() => setSlide(s => s - 1)} />
				) : null}
				{slide < 2 ? (
					<ConsoleButton
						label={t('onboarding.next')}
						trailing={<ArrowRight size={16} color={action.onPrimary} strokeWidth={2} />}
						onPress={() => setSlide(s => s + 1)}
					/>
				) : (
					<ConsoleButton
						label={t('onboarding.getStarted')}
						trailing={<ArrowRight size={16} color={action.onPrimary} strokeWidth={2} />}
						onPress={finish}
					/>
				)}
			</View>
		</View>
	)
}

function ValueSlide() {
	const { t } = useTranslation()
	return (
		<View className="items-center gap-6">
			<View className="flex-row items-center gap-2">
				{CHANNEL_KINDS.map(kind => {
					const Glyph = channelGlyph[kind]
					return (
						<View key={kind} className="h-12 w-12 items-center justify-center rounded-pill" style={{ backgroundColor: action.primary }}>
							<Glyph size={20} color={action.onPrimary} strokeWidth={2} />
						</View>
					)
				})}
				<ArrowRight size={22} color={fg.fg0} strokeWidth={2} />
				{PROVIDER_KINDS.map(kind => {
					const Glyph = providerGlyph[kind]
					return (
						<View key={kind} className="h-12 w-12 items-center justify-center rounded-pill border border-border">
							<Glyph size={20} color={fg.fg0} strokeWidth={2} />
						</View>
					)
				})}
			</View>
			<DisplayTitle fontSize={40} className="text-center">
				{t('onboarding.slide1Title')}
			</DisplayTitle>
			<Text className="text-center font-sans text-sm text-muted-foreground">{t('onboarding.slide1Body')}</Text>
		</View>
	)
}

function HowItWorksSlide() {
	const { t } = useTranslation()
	const steps = [
		{ n: 1, title: t('onboarding.step1Title'), body: t('onboarding.step1Body') },
		{ n: 2, title: t('onboarding.step2Title'), body: t('onboarding.step2Body') },
		{ n: 3, title: t('onboarding.step3Title'), body: t('onboarding.step3Body') },
	]
	return (
		<View className="w-full items-center gap-6">
			<DisplayTitle fontSize={40} className="text-center">
				{t('onboarding.slide2Title')}
			</DisplayTitle>
			<View className="w-full gap-5">
				{steps.map(step => (
					<View key={step.n} className="flex-row items-start gap-4">
						<View className="h-8 w-8 items-center justify-center rounded-pill" style={{ backgroundColor: action.primary }}>
							<Text className="font-sans-bold text-sm" style={{ color: action.onPrimary }}>
								{step.n}
							</Text>
						</View>
						<View className="flex-1">
							<Text className="font-sans-semi text-sm text-foreground">{step.title}</Text>
							<Text className="font-sans text-xs text-muted-foreground">{step.body}</Text>
						</View>
					</View>
				))}
			</View>
		</View>
	)
}

function ControlSlide() {
	const { t } = useTranslation()
	return (
		<View className="items-center gap-6">
			<DisplayTitle fontSize={40} className="text-center">
				{t('onboarding.slide3Title')}
			</DisplayTitle>
			<Text className="text-center font-sans text-sm text-muted-foreground">{t('onboarding.slide3Body')}</Text>
		</View>
	)
}
