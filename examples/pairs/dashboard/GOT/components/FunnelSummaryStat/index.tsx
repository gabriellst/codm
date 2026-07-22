// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT-ORIGIN · want→got corpus · examples/pairs/dashboard
// repo:    template-fullstack
// branch:  feat/template-polyglot
// source:  packages/app/react/src/routes/(app)/dashboard/-components/FunnelSummaryStat/index.tsx
// role:    Leaf — surfaceless rail metric (icon+label+hint / value+delta)
// Verbatim copy kept as corpus reference — NOT a live module. Do not import it.
// ─────────────────────────────────────────────────────────────────────────────
import * as React from 'react'
import { cn } from '@/lib/utils'
import { GradientIconBadge } from '@/components/ui/gradient-icon-badge'
import { InfoHint } from '@/components/ui/info-hint'
import { MetricDelta } from '@/components/ui/metric-delta'
import type { IconComponent } from '@/components/ui/icons'

interface FunnelSummaryStatProps extends React.ComponentProps<'article'> {
	icon: IconComponent
	label: string
	hint: React.ReactNode
	/** Pre-formatted display string, e.g. "0,0%" or "R$ 0,00". */
	value: string
	deltaPct?: number
}

/**
 * FunnelSummaryStat — surfaceless rail metric (Leaf): icon + label + info hint on one row,
 * value + delta on the row below. No Card (the parent owns the surface).
 */
export function FunnelSummaryStat({ icon, label, hint, value, deltaPct, className, ...props }: FunnelSummaryStatProps) {
	return (
		<article className={cn('flex flex-col gap-2', className)} {...props}>
			<div className="flex items-center gap-2">
				<GradientIconBadge icon={icon} />
				<span className="text-sm text-muted-foreground">{label}</span>
				<InfoHint label={label}>{hint}</InfoHint>
			</div>
			<div className="flex items-center gap-2">
				<span className="text-2xl font-bold text-foreground">{value}</span>
				{deltaPct !== undefined ? <MetricDelta pct={deltaPct} /> : null}
			</div>
		</article>
	)
}
