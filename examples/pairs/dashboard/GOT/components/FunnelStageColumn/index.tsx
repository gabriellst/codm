// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT-ORIGIN · want→got corpus · examples/pairs/dashboard
// repo:    template-fullstack
// branch:  feat/template-polyglot
// source:  packages/app/react/src/routes/(app)/dashboard/-components/FunnelStageColumn/index.tsx
// role:    Leaf — one surfaceless funnel stage column with log-attenuated drop-off polygon
// Verbatim copy kept as corpus reference — NOT a live module. Do not import it.
// ─────────────────────────────────────────────────────────────────────────────
import * as React from 'react'
import { IconUsersGroup } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { formatPercent } from '@/lib/format'
import { attenuate, type FunnelStageRow } from '../PixelFunnelSection/funnel'

interface FunnelStageColumnProps extends React.ComponentProps<'article'> {
	row: FunnelStageRow
}

/**
 * FunnelStageColumn — one surfaceless funnel stage (Leaf, rendered N times). Label, percent,
 * "{value} de {base}" subtitle, sessions icon, and a log-attenuated drop-off area. The parent owns
 * the Card surface + separators; this is just a column.
 */
export function FunnelStageColumn({ row, className, ...props }: FunnelStageColumnProps) {
	const { t } = useTranslation()
	const ratio = row.base > 0 ? row.value / row.base : 0
	const nextRatio = row.base > 0 ? row.nextValue / row.base : 0
	const topLeft = (1 - attenuate(ratio)) * 100
	const topRight = (1 - attenuate(nextRatio)) * 100
	const label = t(`pixelFunnel.steps.${row.key}` as const)

	return (
		<article
			className={cn('flex min-w-0 flex-1 flex-col gap-2 px-4', className)}
			role="listitem"
			aria-label={`${label}: ${formatPercent(ratio)}`}
			{...props}
		>
			<span className="truncate text-sm text-muted-foreground">{label}</span>
			<span className="text-2xl font-bold text-foreground">{formatPercent(ratio)}</span>
			<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
				<span>{t('pixelFunnel.ofBase', { value: row.value.toLocaleString('pt-BR'), base: row.base.toLocaleString('pt-BR') })}</span>
				<IconUsersGroup className="size-4" aria-hidden />
			</div>
			<svg className="mt-auto h-28 w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
				<polygon points={`0,${topLeft} 100,${topRight} 100,100 0,100`} className="fill-template-purple/70" />
			</svg>
		</article>
	)
}
