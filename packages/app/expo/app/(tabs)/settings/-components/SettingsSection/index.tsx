import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { PageHeader, ScrollScreen } from '@/components/console'
import { Separator } from '@/components/ui/Separator'
import { ProvidersSection } from '../ProvidersSection'
import { StopCriteriaSection } from '../StopCriteriaSection'
import { GeneralSection } from '../GeneralSection'

/** Providers, stop criteria and general preferences. Each subsection owns its own read. */
export function SettingsSection() {
	const { t } = useTranslation()
	return (
		<ScrollScreen gap={28}>
			<PageHeader title={t('settings.title')} />
			<ProvidersSection />
			<Separator />
			<StopCriteriaSection />
			<Separator />
			<GeneralSection />
			<View className="h-4" />
		</ScrollScreen>
	)
}
