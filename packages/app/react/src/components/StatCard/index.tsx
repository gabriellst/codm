import type { ComponentProps, ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { MetricDelta } from '@/components/ui/metric-delta'
import type { IconComponent } from '@/components/ui/icons'

const statCard = cva('relative flex flex-row items-center gap-4 px-6 py-[21px]', {
	variants: {
		tone: {
			// default keeps Card's `surface` gradient-box. positive/negative override only the
			// gradient fill to a solid token color (keeps the gradient-box border) — original-product idiom.
			default: '',
			positive: 'gradient-bg-[var(--success),var(--success)] text-success-foreground',
			negative: 'gradient-bg-[var(--destructive),var(--destructive)] text-destructive-foreground',
		},
	},
	defaultVariants: { tone: 'default' },
})

interface StatCardProps extends ComponentProps<typeof Card>, VariantProps<typeof statCard> {
	/** Badge icon (custom icon or Tabler). */
	icon: IconComponent
	label: string
	/** Pre-formatted value, e.g. "R$ 3.989,61", "34,6%", "91". */
	value: string
	deltaPct?: number
	/** Label-side slot: <InfoHint/>, a platform badge, a status pill. */
	adornment?: ReactNode
	/** Top-right slot: a group of icon Buttons (edit / refresh+add / swap). */
	actions?: ReactNode
}

/**
 * StatCard — shared KPI/stat card. Composed from primitives (Card, flat icon badge,
 * MetricDelta). `tone` recolors the whole surface from tokens (default = card,
 * positive = --success, negative = --destructive) and is set by the consumer from the
 * metric sign on the highlighted card; children adapt via `onColor`. Heterogeneous bits
 * (label adornment, top-right actions) are ReactNode slots.
 */
export function StatCard({ icon: Icon, label, value, deltaPct, tone, adornment, actions, className, ...props }: StatCardProps) {
	const onColor = tone === 'positive' || tone === 'negative'
	return (
		<Card className={cn(statCard({ tone }), className)} {...props}>
			{actions ? <div className="absolute top-3 right-3 flex gap-1.5">{actions}</div> : null}
			<span
				className={cn(
					'flex size-11 shrink-0 items-center justify-center rounded-full',
					onColor ? 'bg-current/25 text-current' : 'bg-secondary text-foreground',
				)}
				aria-hidden
			>
				<Icon className="size-5" />
			</span>
			<div className="flex min-w-0 flex-1 flex-col gap-2">
				<div className="flex items-end gap-0.5">
					<span className={cn('truncate text-lg font-medium', onColor ? 'opacity-90' : 'text-muted-foreground')}>{label}</span>
					{adornment}
				</div>
				<div className="flex items-center gap-2">
					<span className={cn('truncate text-2xl font-bold', !onColor && 'text-foreground')}>{value}</span>
					{deltaPct !== undefined ? <MetricDelta pct={deltaPct} onColor={onColor} /> : null}
				</div>
			</div>
		</Card>
	)
}
