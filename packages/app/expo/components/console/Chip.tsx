import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Small pill chip for status / meta. The CodeDM language is monochrome, so the
 * only fills are black (`solid`), soft-gray (`soft`) or a hairline outline
 * (`outline`); any color lives in an optional leading `<Dot>`, never the chip.
 */
const chipVariants = cva('flex-row items-center gap-1.5 self-start rounded-pill px-2.5 py-1', {
	variants: {
		tone: {
			outline: 'border border-border bg-background',
			soft: 'bg-secondary',
			solid: 'bg-primary',
		},
	},
	defaultVariants: { tone: 'outline' },
})

const chipLabelVariants = cva('font-sans-semi text-xs', {
	variants: {
		tone: {
			outline: 'text-foreground',
			soft: 'text-foreground',
			solid: 'text-primary-foreground',
		},
	},
	defaultVariants: { tone: 'outline' },
})

interface ChipProps extends VariantProps<typeof chipVariants> {
	label: string
	leading?: ReactNode
	className?: string
}

export function Chip({ label, tone, leading, className }: ChipProps) {
	return (
		<View className={cn(chipVariants({ tone }), className)}>
			{leading}
			<Text className={chipLabelVariants({ tone })}>{label}</Text>
		</View>
	)
}
