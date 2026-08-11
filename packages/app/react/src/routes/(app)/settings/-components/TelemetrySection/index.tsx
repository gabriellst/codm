import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { sectionLabel, surface } from '@/components/ui/surfaces'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { useTelemetryConsentStore } from '@/stores'

/**
 * SP4 spec (Emenda 2026-08-07): "toggle nas settings, default ON, com aviso" — AC-5. This component
 * only writes the INTENT to `useTelemetryConsentStore`; `useAnalyticsConsent` (mounted at the app
 * root, `routes/__root.tsx`) is what actually calls `optIn`/`optOut` on the bound `AnalyticsService`,
 * so the same effect handles both a live toggle here AND the boot-time restore of a previously
 * saved choice — this component doesn't need to know which.
 */
export function TelemetrySection({ className, ...props }: ComponentProps<'section'>) {
	const { t } = useTranslation()
	const enabled = useTelemetryConsentStore(s => s.enabled)
	const setEnabled = useTelemetryConsentStore(s => s.setEnabled)

	return (
		<section className={cn('flex flex-col gap-3', className)} {...props}>
			<h2 className={sectionLabel}>{t('settings.telemetry')}</h2>
			<label className={cn('flex cursor-pointer items-center gap-6 rounded-asymmetric-md p-4', surface)}>
				<div className="flex flex-1 flex-col gap-1">
					<span className="text-sm font-bold text-foreground">{t('settings.telemetryConsentLabel')}</span>
					<span className="text-sm text-muted-foreground">{t('settings.telemetryConsentDescription')}</span>
				</div>
				<Switch checked={enabled} onCheckedChange={setEnabled} />
			</label>
		</section>
	)
}
