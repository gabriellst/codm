import type { ComponentProps } from 'react'
import { IconTrendingDown, IconTrendingUp } from '@tabler/icons-react'

import { cn } from '@/lib/utils'

interface MetricDeltaProps extends ComponentProps<'span'> {
	/** Period-over-period change as a fraction: 0.52 -> +52%, -0.1 -> -10%. */
	pct: number
	/** On a tinted surface, render in currentColor instead of success/destructive. */
	onColor?: boolean
}

/** MetricDelta — signed % change with a trend arrow; color from --success / --destructive tokens. */
export function MetricDelta({ pct, onColor, className, ...props }: MetricDeltaProps) {
	const positive = pct >= 0
	const Icon = positive ? IconTrendingUp : IconTrendingDown
	return (
		<span
			className={cn(
				'inline-flex items-center gap-0.5 text-sm font-medium',
				onColor ? 'text-current' : positive ? 'text-success-bright' : 'text-destructive',
				className,
			)}
			{...props}
		>
			<Icon className="size-4" />
			{`${positive ? '+' : ''}${Math.round(pct * 100)}%`}
		</span>
	)
}
