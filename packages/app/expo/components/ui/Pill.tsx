import { forwardRef } from 'react'
import { View, Text, Pressable, type PressableProps } from 'react-native'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Pill — small chip for meta info (exercise count, duration, status).
 * Replaces the legacy MetaPill with CVA variants.
 *
 * Variants:
 * - `default`: surface-1 + subtle border (sits on cards / lists).
 * - `translucent`: white/8% bg + strong border (sits on hero gradients).
 * - `success`: success-tinted bg + label.
 * - `warning`: warning-tinted bg + label (e.g. dropset badges).
 */
const pillVariants = cva('flex-row items-center self-start rounded-pill border', {
	variants: {
		variant: {
			default: 'bg-card border-white/[0.08]',
			translucent: 'bg-white/[0.08] border-white/[0.16]',
			success: 'bg-success/10 border-success/30',
			warning: 'bg-warning/10 border-warning/30',
		},
		size: {
			sm: 'px-2 py-1 gap-1',
			md: 'px-3 py-1.5 gap-1.5',
		},
	},
	defaultVariants: { variant: 'default', size: 'md' },
})

const pillLabelVariants = cva('font-sans-semi tracking-pill', {
	variants: {
		variant: {
			default: 'text-foreground',
			translucent: 'text-foreground',
			success: 'text-success',
			warning: 'text-warning',
		},
		size: {
			sm: 'text-[10px] uppercase',
			md: 'text-xs',
		},
	},
	defaultVariants: { variant: 'default', size: 'md' },
})

export interface PillProps extends Omit<PressableProps, 'children' | 'style'>, VariantProps<typeof pillVariants> {
	label: string
	leading?: React.ReactNode
	className?: string
	labelClassName?: string
}

export const Pill = forwardRef<View, PillProps>(function Pill(
	{ className, labelClassName, variant = 'default', size = 'md', label, leading, onPress, ...props },
	ref,
) {
	const Wrapper = onPress ? Pressable : View
	return (
		<Wrapper
			ref={ref as never}
			onPress={onPress}
			data-slot="pill"
			className={cn(pillVariants({ variant, size }), className)}
			{...(props as PressableProps)}
		>
			{leading}
			<Text className={cn(pillLabelVariants({ variant, size }), labelClassName)}>{label}</Text>
		</Wrapper>
	)
})
