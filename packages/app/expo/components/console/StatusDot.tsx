import { View } from 'react-native'
import type { ThreadStatus } from '@codedm/client-typescript/typescript'
import { cn } from '@/lib/utils'
import { threadStatusDotClass } from './glyphs'

/** The recurring status token — a small colored dot. Color is the only place
 *  status ever uses hue in the CodeDM language. */
export function Dot({ className }: { className?: string }) {
	return <View className={cn('h-2 w-2 rounded-pill', className)} />
}

export function ThreadStatusDot({ status, className }: { status: ThreadStatus; className?: string }) {
	return <Dot className={cn(threadStatusDotClass[status], className)} />
}
