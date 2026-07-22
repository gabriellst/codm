import { PageHeader } from '@/components/console/PageHeader'
import { Separator } from '@/components/ui/separator'
import { ProvidersSection } from '../ProvidersSection'
import { StopCriteriaSection } from '../StopCriteriaSection'
import { GeneralSection } from '../GeneralSection'

/** Providers, stop criteria and general preferences (T08). Each subsection owns its own read. */
export function SettingsSection() {
	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 pb-16 pt-20">
			<PageHeader title="Settings" />
			<ProvidersSection />
			<Separator />
			<StopCriteriaSection />
			<Separator />
			<GeneralSection />
		</div>
	)
}
