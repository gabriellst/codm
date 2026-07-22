import { ScrollView, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { Text } from '@/components/ui/Text'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { DisplayTitle } from '@/components/ui/DisplayTitle'

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
			</ScrollView>
		</View>
	)
}
