import { useTranslation } from 'react-i18next'
import { useGetSettings } from '@codedm/client-typescript/typescript'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Environment facts (T08): where the data lives and which build is running.
 *
 * Operator and timezone were dropped (founder, 29-jul). Neither was actionable here: CodeDM runs as a
 * single local operator with no account to name, so "Operador — Sem nome" was a row asking to be
 * filled in by a screen that does not exist, and the timezone is the machine's. A settings list should
 * only hold things you can act on or facts you would go looking for.
 */
export function GeneralSection() {
	const { t } = useTranslation()
	const { data, isLoading } = useGetSettings()

	if (isLoading || !data) {
		return (
			<section className="flex flex-col gap-3">
				<h2 className="label-eyebrow">{t('settings.general')}</h2>
				<Skeleton className="h-24 rounded-2xl" />
			</section>
		)
	}

	const rows: { label: string; value: string; mono?: boolean }[] = [
		{ label: t('settings.generalDataDir'), value: data.general.dataDir, mono: true },
		{ label: t('settings.generalAppVersion'), value: data.appVersion, mono: true },
	]

	return (
		<section className="flex flex-col gap-3">
			<h2 className="label-eyebrow">{t('settings.general')}</h2>
			<div className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
				{rows.map(row => (
					<div key={row.label} className="flex items-center justify-between gap-4 p-4">
						<span className="text-sm font-medium text-foreground">{row.label}</span>
						<span className={`truncate text-sm text-muted-foreground ${row.mono ? 'font-mono text-xs' : ''}`}>{row.value}</span>
					</div>
				))}
			</div>
		</section>
	)
}
