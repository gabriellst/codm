import { forwardRef } from 'react'
import { View, Text, Pressable, type PressableProps } from 'react-native'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Pill — small chip for meta info (status, counts, labels), on the CodeDM
 * monochrome-light console language (mirrors `components/console/Chip`).
 *
 * Variants:
 * - `default`: soft `bg-secondary` fill, no border — sits on cards / lists.
 * - `outline`: hairline `border-border` on the canvas.
 */
const pillVariants = cva('flex-row items-center self-start rounded-pill', {
	variants: {
		variant: {
			default: 'bg-secondary',
			outline: 'border border-border bg-background',
		},
		size: {
			sm: 'px-2 py-1 gap-1',
			md: 'px-3 py-1.5 gap-1.5',
		},
	},
	defaultVariants: { variant: 'default', size: 'md' },
})

const pillLabelVariants = cva('font-sans-semi text-foreground', {
	variants: {
		size: {
			sm: 'text-[10px] uppercase',
			md: 'text-xs',
		},
	},
	defaultVariants: { size: 'md' },
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
			<Text className={cn(pillLabelVariants({ size }), labelClassName)}>{label}</Text>
		</Wrapper>
	)
})
