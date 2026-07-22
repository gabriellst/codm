import type { ReactNode } from 'react'
import { View, type ViewProps } from 'react-native'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * White surface with a hairline border and pill-ish radius — the CodeDM card.
 * `padding="none"` + the `ListCard` wrapper below give the divided-row lists
 * (channels, criteria, active sessions) their flush hairline separators.
 */
const cardVariants = cva('rounded-xl border border-border bg-card', {
	variants: {
		padding: {
			none: '',
			sm: 'p-3',
			md: 'p-4',
			lg: 'p-5',
		},
	},
	defaultVariants: { padding: 'md' },
})

interface ConsoleCardProps extends ViewProps, VariantProps<typeof cardVariants> {
	className?: string
}

export function ConsoleCard({ className, padding, ...props }: ConsoleCardProps) {
	return <View className={cn(cardVariants({ padding }), className)} {...props} />
}

/** A card that hosts a vertical list of rows separated by hairlines. Pass rows
 *  as children; each non-first row draws a top border. */
export function ListCard({ children, className }: { children: ReactNode; className?: string }) {
	return <ConsoleCard padding="none" className={cn('overflow-hidden', className)}>{children}</ConsoleCard>
}

/** One row inside a `ListCard`. `first` omits the top hairline. */
export function ListRow({ children, first, className }: { children: ReactNode; first?: boolean; className?: string }) {
	return <View className={cn('flex-row items-center gap-3 p-4', !first && 'border-t border-border', className)}>{children}</View>
}
