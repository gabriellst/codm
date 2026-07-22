import { Pressable, Text, View, type PressableProps } from 'react-native'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Avatar — circular initial chip used in tab headers and the profile card.
 * Supports `sm` (header), `md` (default), `lg` (profile card) sizes.
 */
const avatarVariants = cva('rounded-pill bg-popover border border-white/[0.16] items-center justify-center', {
	variants: {
		size: {
			sm: 'w-9 h-9',
			md: 'w-11 h-11',
			lg: 'w-14 h-14',
		},
	},
	defaultVariants: { size: 'sm' },
})

const avatarTextVariants = cva('text-foreground font-sans-bold', {
	variants: {
		size: {
			sm: 'text-[13px]',
			md: 'text-base',
			lg: 'text-2xl',
		},
	},
	defaultVariants: { size: 'sm' },
})

interface AvatarProps extends Omit<PressableProps, 'children'>, VariantProps<typeof avatarVariants> {
	initial: string
	className?: string
}

export function Avatar({ initial, size, onPress, className, ...props }: AvatarProps) {
	const Wrapper = onPress ? Pressable : View
	return (
		<Wrapper
			onPress={onPress}
			accessibilityRole={onPress ? 'button' : undefined}
			data-slot="avatar"
			className={cn(avatarVariants({ size }), className)}
			{...(props as PressableProps)}
		>
			<Text className={avatarTextVariants({ size })}>{initial}</Text>
		</Wrapper>
	)
}
