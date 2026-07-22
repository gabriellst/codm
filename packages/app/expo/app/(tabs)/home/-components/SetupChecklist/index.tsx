import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { router } from 'expo-router'
import { Check } from 'lucide-react-native'
import type { GetSetupChecklistQueryResponse } from '@codedm/client-typescript/typescript'
import { ConsoleCard, ScrollScreen, greeting } from '@/components/console'
import { DisplayTitle } from '@/components/ui/DisplayTitle'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { resetOnboarding } from '@/lib/onboarding'
import { action, fg } from '@/lib/tokens'

interface Step {
	n: number
	title: string
	body: string
	done: boolean
}

/**
 * First-run Home: the empty state that turns three cold-start chores into a
 * checklist. Pairing a channel, adding a workspace and attaching a thread all
 * happen on the desktop console (QR / filesystem), so on mobile these rows are
 * a live status mirror — done flags flip as the daemon reports them — not fake
 * mobile flows.
 */
export function SetupChecklist({ checklist }: { checklist: GetSetupChecklistQueryResponse }) {
	const { t } = useTranslation()

	const steps: Step[] = [
		{ n: 1, title: t('setup.step1Title'), body: t('setup.step1Body'), done: checklist.channelDone },
		{ n: 2, title: t('setup.step2Title'), body: t('setup.step2Body'), done: checklist.workspaceDone },
		{ n: 3, title: t('setup.step3Title'), body: t('setup.step3Body'), done: checklist.threadDone },
	]

	const replay = async () => {
		await resetOnboarding()
		router.replace('/onboarding')
	}

	return (
		<ScrollScreen>
			<View className="gap-2 pt-6">
				<Eyebrow>{greeting()}</Eyebrow>
				<DisplayTitle fontSize={40}>{t('setup.title')}</DisplayTitle>
				<Text className="font-sans text-sm text-muted-foreground">{t('setup.subtitle')}</Text>
			</View>

			<ConsoleCard padding="sm">
				{steps.map(step => (
					<View key={step.n} className="flex-row items-center gap-4 p-3">
						<View
							className="h-8 w-8 items-center justify-center rounded-pill border border-border"
							style={step.done ? { backgroundColor: action.primary, borderColor: action.primary } : undefined}
						>
							{step.done ? (
								<Check size={16} color={action.onPrimary} strokeWidth={2.5} />
							) : (
								<Text className="font-sans-bold text-sm text-foreground">{step.n}</Text>
							)}
						</View>
						<View className="flex-1">
							<Text className="font-sans-semi text-sm text-foreground">{step.title}</Text>
							<Text className="font-sans text-xs text-muted-foreground">{step.body}</Text>
						</View>
						<Text className="font-sans-semi text-xs text-muted-foreground">
							{step.done ? t('setup.done') : t('setup.setUp')}
						</Text>
					</View>
				))}
			</ConsoleCard>

			<Pressable onPress={replay} hitSlop={8} className="self-center py-2">
				<Text className="font-sans-semi text-sm text-foreground underline" style={{ color: fg.fg0 }}>
					{t('home.replayIntro')}
				</Text>
			</Pressable>
		</ScrollScreen>
	)
}
