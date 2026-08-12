import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { IconLock } from '@tabler/icons-react'
import { useGetMyAccount } from '@codm/client-typescript/typescript'
import { enumLabel } from '@/lib'
import { sectionLabelBare } from '@/components/ui/surfaces'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface ReadonlyFieldProps {
	label: string
	value: string
	/** Moeda (D3): muted fill + lock glyph — the design's own "read-only" marker (measured pP3Rr). */
	locked?: boolean
}

function ReadonlyField({ label, value, locked }: ReadonlyFieldProps) {
	return (
		<div className="flex flex-1 flex-col gap-1.5">
			<span className="text-xs font-semibold text-muted-foreground">{label}</span>
			<div
				className={cn(
					'flex items-center justify-between gap-2.5 rounded-asymmetric-xs border border-input px-3.5 py-2.5 text-sm font-medium',
					locked ? 'bg-muted text-caption-foreground' : 'bg-background text-foreground',
				)}
			>
				<span className="truncate">{value}</span>
				{locked && <IconLock className="size-3.5 shrink-0 text-caption-foreground" />}
			</div>
		</div>
	)
}

/**
 * PreferencesSection — D3 "Preferências" (jxl4Y, Minha Conta). Reads `useGetMyAccount().preferences`
 * (language/timezone/currency — all present on the wire already). All three render READ-ONLY: no
 * `update-preferences` mutation exists in the SDK yet, and unlike the design's Idioma/Fuso horário
 * fields (which carry a chevron, implying a future Select), this pass drops that affordance rather
 * than show a trigger that opens nothing — an inert-looking control is worse than an honest static
 * value. Only Moeda keeps its design treatment as-is, since the design ALREADY marks it read-only
 * (muted fill + lock glyph, plus its own label literally says "somente leitura").
 */
export function PreferencesSection({ className, ...props }: ComponentProps<'section'>) {
	const { t } = useTranslation()
	const { data, isPending, isError } = useGetMyAccount()

	if (isPending) {
		return (
			<section className={cn('flex flex-col gap-3', className)} {...props}>
				<h2 className={sectionLabelBare}>{t('account.preferences.sectionTitle')}</h2>
				<div className="flex gap-3.5">
					<Skeleton className="h-14 flex-1 rounded-asymmetric-xs" />
					<Skeleton className="h-14 flex-1 rounded-asymmetric-xs" />
					<Skeleton className="h-14 flex-1 rounded-asymmetric-xs" />
				</div>
			</section>
		)
	}

	if (isError || !data) {
		return (
			<section className={cn('flex flex-col gap-3', className)} {...props}>
				<h2 className={sectionLabelBare}>{t('account.preferences.sectionTitle')}</h2>
				<p className="text-sm text-muted-foreground">{t('account.preferences.loadError')}</p>
			</section>
		)
	}

	return (
		<section className={cn('flex flex-col gap-3', className)} {...props}>
			<h2 className={sectionLabelBare}>{t('account.preferences.sectionTitle')}</h2>
			<div className="flex flex-col gap-3.5 sm:flex-row">
				<ReadonlyField label={t('account.preferences.language')} value={enumLabel('Language', data.preferences.language)} />
				<ReadonlyField label={t('account.preferences.timezone')} value={data.preferences.timezone} />
				<ReadonlyField label={t('account.preferences.currency')} value={enumLabel('CurrencyCode', data.preferences.currency)} locked />
			</div>
		</section>
	)
}
