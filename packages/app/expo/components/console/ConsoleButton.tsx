import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, type PressableProps, Text, View } from 'react-native'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { action, fg } from '@/lib/tokens'

/**
 * The CodeDM console button. Black pill (`primary`) is the sole strong action;
 * `outline` is a hairline-bordered secondary; `ghost` is text-only. Uppercase
 * is reserved for the display type — button labels stay sentence case, matching
 * the react console's pill buttons.
 */
const buttonVariants = cva('flex-row items-center justify-center gap-2 rounded-pill', {
	variants: {
		variant: {
			primary: 'bg-primary',
			outline: 'border border-border bg-background',
			ghost: 'bg-transparent',
		},
		size: {
			sm: 'h-9 px-4',
			md: 'h-11 px-5',
		},
		fullWidth: { true: 'w-full', false: '' },
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
		size: { sm: 'text-sm', md: 'text-sm' },
	},
	defaultVariants: { variant: 'primary', size: 'md' },
})

interface ConsoleButtonProps
	extends Omit<PressableProps, 'children' | 'style'>,
		Pick<VariantProps<typeof buttonVariants>, 'variant' | 'size' | 'fullWidth'> {
	label: string
	leading?: ReactNode
	trailing?: ReactNode
	loading?: boolean
	className?: string
}

export function ConsoleButton({
	label,
	leading,
	trailing,
	loading,
	variant,
	size,
	fullWidth,
	disabled,
	className,
	...props
}: ConsoleButtonProps) {
	const isDisabled = disabled || loading
	const spinnerColor = variant === 'primary' || variant == null ? action.onPrimary : fg.fg0
	return (
		<Pressable
			accessibilityRole="button"
			disabled={isDisabled}
			className={cn(buttonVariants({ variant, size, fullWidth }), isDisabled && 'opacity-40', className)}
			style={({ pressed }) => (pressed ? { opacity: 0.8 } : undefined)}
			{...props}
		>
			{loading ? (
				<ActivityIndicator size="small" color={spinnerColor} />
			) : (
				<View className="flex-row items-center gap-2">
					{leading}
					<Text className={labelVariants({ variant, size })}>{label}</Text>
					{trailing}
				</View>
			)}
		</Pressable>
	)
}
