import { View, type ViewProps } from 'react-native'
import { cn } from '@/lib/utils'

export function Separator({ className, ...props }: ViewProps & { strong?: boolean }) {
	return <View className={cn('h-px bg-border', props.strong && 'bg-border-strong', className)} {...props} />
}
