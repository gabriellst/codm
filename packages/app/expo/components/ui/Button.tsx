import { forwardRef } from 'react'
import { Animated, Pressable, type PressableProps, Text, View } from 'react-native'
import { cva, type VariantProps } from 'class-variance-authority'
import { Haptics } from 'react-native-nitro-haptics'
import { cn } from '@/lib/utils'
import { useAnimatedPress } from '@/lib/use-animated-press'

// `Animated.createAnimatedComponent` keeps Pressable as the outermost
// element (preserving its layout box and ref forwarding) while letting
// us animate `transform` / `opacity` natively on press in/out.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * Button — single primitive for the whole button family, on the CodeDM
 * monochrome-light console language (mirrors `components/console/ConsoleButton`).
 *
 * Variants (use the `variant` prop):
 * - `primary` (default): solid black pill (`bg-primary`) with white label — the
 *   sole strong action.
 * - `outline`: hairline-bordered (`border-border`) secondary on the canvas.
 * - `ghost`: text-only tertiary action.
 *
 * Sizes:
 * - `sm`: h-10.
 * - `md` (default): h-12, primary CTA size.
 * - `lg`: h-14, hero CTAs.
 */

const buttonVariants = cva('flex-row items-center justify-center gap-2 rounded-pill', {
	variants: {
		variant: {
			primary: 'bg-primary',
			outline: 'border border-border bg-background',
			ghost: 'bg-transparent rounded-none',
		},
		size: {
			sm: 'h-10 px-5',
			md: 'h-12 px-6',
			lg: 'h-14 px-7',
		},
		fullWidth: {
			true: 'w-full',
			false: '',
		},
	},
	defaultVariants: { variant: 'primary', size: 'md', fullWidth: false },
})

const labelVariants = cva('font-sans-semi', {
	variants: {
		variant: {
			primary: 'text-primary-foreground',
			outline: 'text-foreground',
			ghost: 'text-foreground',
		},
		size: {
			sm: 'text-sm',
			md: 'text-sm',
			lg: 'text-base',
		},
	},
	defaultVariants: { variant: 'primary', size: 'md' },
})

interface ButtonProps
	extends Omit<PressableProps, 'children' | 'style'>,
		Pick<VariantProps<typeof buttonVariants>, 'variant' | 'size' | 'fullWidth'> {
	/**
	 * Visible text. Optional so icon-only buttons (e.g. a trash button on a
	 * swipe action) can render just the `leading` slot. Icon-only callers
	 * must set `accessibilityLabel` for screen readers.
	 */
	label?: string
	leading?: React.ReactNode
	trailing?: React.ReactNode
	className?: string
}

export const Button = forwardRef<View, ButtonProps>(function Button(
	{ label, leading, trailing, variant, size, fullWidth, className, onPress, disabled, ...props },
	ref,
) {
	const { animatedStyle, onPressIn, onPressOut } = useAnimatedPress({ opacityTo: 0.8 })

	const handlePress: PressableProps['onPress'] = e => {
		if (disabled) return
		Haptics.impact('medium')
		onPress?.(e)
	}

	return (
		<AnimatedPressable
			ref={ref}
			accessibilityRole="button"
			onPress={handlePress}
			onPressIn={onPressIn}
			onPressOut={onPressOut}
			disabled={disabled}
			data-slot="button"
			className={cn(buttonVariants({ variant, size, fullWidth }), disabled && 'opacity-40', className)}
			style={animatedStyle}
			{...props}
		>
			{leading}
			{label ? <Text className={cn(labelVariants({ variant, size }))}>{label}</Text> : null}
			{trailing}
		</AnimatedPressable>
	)
})
