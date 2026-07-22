// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-expo-form-state-subscribe
// task:        synthetic-expo-form-state-subscribe
// stamp:       expo-formsub-iter7
// docTreeHash: 46468161d9ca
// model:       sonnet
// graded:      2026-06-12T17:35:14.911Z
// source:      packages/app/expo/app/(tabs)/home/index.tsx (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
import { ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { Text } from '@/components/ui/Text'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { DisplayTitle } from '@/components/ui/DisplayTitle'
import { Button } from '@/components/ui/Button'

/**
 * Minimal placeholder Home tab — composed entirely from design-system
 * primitives so it renders a sensible boilerplate screen without depending
 * on any product-specific SDK queries.
 */
export default function HomeTab() {
	const { t } = useTranslation()

	return (
		<View className="flex-1 bg-background">
			<ScrollView
				contentContainerStyle={{ paddingBottom: 110, paddingTop: 24, paddingHorizontal: 20, gap: 16 }}
				contentInsetAdjustmentBehavior="automatic"
				showsVerticalScrollIndicator={false}
				className="flex-1"
			>
				<Eyebrow tone="strong" tracking="tight">
					{t('home.eyebrow')}
				</Eyebrow>
				<DisplayTitle fontSize={48}>{t('home.welcome')}</DisplayTitle>
				<Card>
					<Text>{t('home.placeholder')}</Text>
				</Card>

				<Button
					label={t('home.createKit')}
					fullWidth
					onPress={() => router.push('/(sheets)/kit-form')}
				/>
			</ScrollView>
		</View>
	)
}
