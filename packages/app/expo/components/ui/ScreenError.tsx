import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'

interface ScreenErrorProps {
	title?: string
	message?: string
	onRetry?: () => void
}

/**
 * Generic error state for screen-level SDK query failures.
 */
export function ScreenError({ title, message, onRetry }: ScreenErrorProps) {
	const { t } = useTranslation()
	return (
		<View className="flex-1 bg-background items-center justify-center px-8 gap-3">
			<Text className="text-foreground font-sans-bold text-lg text-center">{title ?? t('errors.title')}</Text>
			<Text className="text-foreground-subtle font-sans text-sm text-center">{message ?? t('screenError.message')}</Text>
			{onRetry ? <Button variant="ghost" label={t('common.retry')} onPress={onRetry} className="mt-2" /> : null}
		</View>
	)
}
