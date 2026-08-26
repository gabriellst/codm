import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useGetSettings } from '@codm/client-typescript/typescript'
import { sectionLabelBare, surface } from '@codm/app-ui/surfaces'
import { Skeleton } from '@codm/app-ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * Environment facts (T08): where the data lives and which build is running.
 *
 * Operator and timezone were dropped (founder, 29-jul). Neither was actionable here: CODM runs as a
 * single local operator with no account to name, so "Operador — Sem nome" was a row asking to be
 * filled in by a screen that does not exist, and the timezone is the machine's. A settings list should
 * only hold things you can act on or facts you would go looking for.
 *
 * D3 (Configurações, cixrK) — each row is now its own bordered card (`surface` + rounded-asymmetric-sm,
 * `gap-2.5` between them), not a single divided container. Order flips: "Versão do app" leads,
 * "Diretório de dados" follows (measured hMUPO/OblJY).
 */
export function GeneralSection({ className, ...props }: ComponentProps<'section'>) {
	const { t } = useTranslation()
	const { data, isLoading } = useGetSettings()

	if (isLoading || !data) {
		return (
			<section className={cn('flex flex-col gap-3', className)} {...props}>
				<h2 className={sectionLabelBare}>{t('settings.general')}</h2>
				<Skeleton className="h-14 rounded-asymmetric-sm" />
				<Skeleton className="h-14 rounded-asymmetric-sm" />
			</section>
		)
	}

	const rows: { label: string; value: string; mono?: boolean }[] = [
		{ label: t('settings.generalAppVersion'), value: data.appVersion, mono: true },
		{ label: t('settings.generalDataDir'), value: data.general.dataDir, mono: true },
	]

	return (
		<section className={cn('flex flex-col gap-3', className)} {...props}>
			<h2 className={sectionLabelBare}>{t('settings.general')}</h2>
			<div className="flex flex-col gap-2.5">
				{rows.map(row => (
					<div key={row.label} className={cn('flex items-center justify-between gap-4 rounded-asymmetric-sm px-4 py-3.5', surface)}>
						<span className="text-sm font-semibold text-foreground">{row.label}</span>
						<span className={cn('truncate text-sm text-muted-foreground', row.mono && 'font-mono text-xs')}>{row.value}</span>
					</div>
				))}
			</div>
		</section>
	)
}
