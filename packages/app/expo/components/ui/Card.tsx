import { forwardRef } from 'react'
import { View, type ViewProps } from 'react-native'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Card primitive — flat surface used across screens.
 *
 * For the glossy gradient-stroke look (workout exercise cards, the history
 * empty state), use `GradientCard` instead — that's intentionally opt-in
 * so the gradient stays special.
 *
 * Variants:
 * - `surface1`: subtle surface (default — listed cards).
 * - `surface2`: raised surface (hovered / active).
 * - `outlined`: transparent with strong border (dashed empty states use
 *   className override).
 */
const cardVariants = cva('rounded-lg border', {
	variants: {
		variant: {
			surface1: 'bg-card border-white/[0.08]',
			surface2: 'bg-popover border-white/[0.16]',
			outlined: 'bg-transparent border-white/[0.16]',
		},
		padding: {
			none: '',
			sm: 'p-3',
			md: 'p-4',
			lg: 'p-5',
		},
	},
	defaultVariants: { variant: 'surface1', padding: 'md' },
})

export interface CardProps extends ViewProps, VariantProps<typeof cardVariants> {
	className?: string
}

export const Card = forwardRef<View, CardProps>(function Card({ className, variant, padding, ...props }, ref) {
	return <View ref={ref} data-slot="card" className={cn(cardVariants({ variant, padding }), className)} {...props} />
})

export function CardHeader({ className, ...props }: ViewProps & { className?: string }) {
	return <View data-slot="card-header" className={cn('flex-row items-center justify-between mb-3', className)} {...props} />
}

export function CardBody({ className, ...props }: ViewProps & { className?: string }) {
	return <View data-slot="card-body" className={cn('flex-col gap-2', className)} {...props} />
}
