// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT-ORIGIN · want→got corpus · examples/pairs/dashboard
// repo:    template-fullstack
// branch:  feat/template-polyglot
// source:  packages/app/react/src/routes/(app)/dashboard/-components/AdditionalCostsSection/AdditionalCostRow.tsx
// role:    Leaf — one cost line; label reveals tooltip on hover, value in destructive color
// Verbatim copy kept as corpus reference — NOT a live module. Do not import it.
// ─────────────────────────────────────────────────────────────────────────────
import type { ComponentProps, ReactNode } from 'react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { GradientIcon } from '@/components/ui/gradient-icon'
import type { IconComponent } from '@/components/ui/icons'
import { cn } from '@/lib/utils'

interface AdditionalCostRowProps extends ComponentProps<'div'> {
	icon: IconComponent
	label: string
	/** Pre-formatted display string for the row's total. */
	value: string
	/** Custom hover content; when present the label becomes the trigger. */
	tooltip?: ReactNode
}

/**
 * One line of the Additional Costs card. Presentational leaf — the owning Section formats the value
 * and builds the tooltip node. When `tooltip` is provided the label reveals it on hover.
 */
export function AdditionalCostRow({ icon: Icon, label, value, tooltip, className, ...props }: AdditionalCostRowProps) {
	return (
		<div role="listitem" className={cn('flex items-center gap-3', className)} {...props}>
			<GradientIcon icon={Icon} className="size-4 shrink-0 text-muted-foreground" />
			{tooltip ? (
				<Tooltip>
					<TooltipTrigger className="border-dashed border-muted-foreground/40 text-sm text-foreground">{label}</TooltipTrigger>
					<TooltipContent>{tooltip}</TooltipContent>
				</Tooltip>
			) : (
				<span className="text-sm text-foreground">{label}</span>
			)}
			<span className="ml-auto text-sm font-medium text-destructive">{value}</span>
		</div>
	)
}
