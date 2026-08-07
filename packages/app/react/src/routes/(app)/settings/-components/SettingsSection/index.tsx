import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/console/PageHeader'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { ProvidersSection } from '../ProvidersSection'
import { StopCriteriaSection } from '../StopCriteriaSection'
import { GeneralSection } from '../GeneralSection'

/** Providers, stop criteria and general preferences (T08). Each subsection owns its own read. */
export function SettingsSection({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	return (
		<div className={cn('mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 pb-16 pt-20', className)} {...props}>
			<PageHeader title={t('settings.title')} />
			<ProvidersSection />
			<Separator />
			<StopCriteriaSection />
			<Separator />
			<GeneralSection />
		</div>
	)
}
