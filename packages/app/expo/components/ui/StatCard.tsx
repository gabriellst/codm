import { forwardRef } from 'react'
import { Pressable, Text, View, type PressableProps } from 'react-native'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { fs, letterSpacingPt, ls } from '@/lib/tokens'
import { displayTextStyle } from './DisplayTitle'

const COMPACT_VALUE_SIZE = 26

/**
 * StatCard — single stat tile with value + optional unit + label.
 * Used by the home tab (compact 3-column row) and the progress tab (large
 * with delta line + icon).
 *
 * Variants:
 * - `compact`: vertical center, tight layout (home tab stats).
 * - `large`: top label + big display value + optional delta row (progress tab).
 */
const statCardVariants = cva('rounded-lg border bg-card border-white/[0.08]', {
	variants: {
		variant: {
			compact: 'flex-1 items-center justify-center min-h-[92px] py-4',
			large: 'flex-1 px-4 py-3.5',
		},
	},
	defaultVariants: { variant: 'compact' },
})

export interface StatCardProps extends Omit<PressableProps, 'children' | 'style'>, VariantProps<typeof statCardVariants> {
	value: string
	unit?: string
	label: string
	delta?: string
	deltaIcon?: React.ReactNode
	/** When provided, color is applied to the delta text via inline style. */
	deltaColor?: string
	className?: string
}

export const StatCard = forwardRef<View, StatCardProps>(function StatCard(
	{ variant = 'compact', value, unit, label, delta, deltaIcon, deltaColor, className, ...props },
	ref,
) {
	if (variant === 'compact') {
		return (
			<Pressable
				ref={ref}
				data-slot="stat-card"
				accessibilityRole="button"
				accessibilityLabel={label}
				className={cn(statCardVariants({ variant }), className)}
				{...props}
			>
				<View className="flex-row items-baseline">
					<Text
						className="text-foreground font-sans-black"
						style={{
							fontSize: COMPACT_VALUE_SIZE,
							lineHeight: COMPACT_VALUE_SIZE,
							fontVariant: ['tabular-nums'],
							letterSpacing: letterSpacingPt(-0.02, COMPACT_VALUE_SIZE),
						}}
					>
						{value}
					</Text>
					{unit ? <Text className="text-foreground-subtle font-sans-bold text-sm ml-0.5">{unit}</Text> : null}
				</View>
				<Text
					className="text-foreground-subtle font-sans-bold uppercase mt-2 text-center"
					style={{ fontSize: fs.micro, letterSpacing: letterSpacingPt(ls.eyebrow, fs.micro) }}
				>
					{label}
				</Text>
			</Pressable>
		)
	}

	return (
		<Pressable
			ref={ref}
			data-slot="stat-card"
			accessibilityRole="button"
			accessibilityLabel={label}
			className={cn(statCardVariants({ variant }), className)}
			{...props}
		>
			<Text
				className="text-foreground-subtle font-sans-bold uppercase"
				style={{ fontSize: fs.micro, letterSpacing: letterSpacingPt(ls.hardUpper, fs.micro) }}
			>
				{label}
			</Text>
			<View className="flex-row items-baseline mt-2">
				<Text className="text-foreground font-display" style={{ ...displayTextStyle(fs.hero), fontVariant: ['tabular-nums'] }}>
					{value}
				</Text>
				{unit ? (
					<Text className="text-foreground-subtle font-sans-bold ml-0.5" style={{ fontSize: fs.lg }}>
						{unit}
					</Text>
				) : null}
			</View>
			{delta ? (
				<View className="flex-row items-center gap-1.5 mt-1.5">
					{deltaIcon}
					<Text
						className="font-sans-bold text-xs"
						style={{
							...(deltaColor ? { color: deltaColor } : {}),
							letterSpacing: letterSpacingPt(0.04, fs.xs),
						}}
					>
						{delta}
					</Text>
				</View>
			) : null}
		</Pressable>
	)
})
