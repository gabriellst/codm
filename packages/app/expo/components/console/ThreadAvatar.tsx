import { Text, View } from 'react-native'
import type { ChannelKind } from '@codedm/client-typescript/typescript'
import { cn } from '@/lib/utils'
import { action } from '@/lib/tokens'
import { channelGlyph } from './glyphs'

/** Two-letter initials from a display name ("Rafa Lima" → "RL", "@caio.dev" → "CA"). */
export function initials(name: string): string {
	const cleaned = name.replace(/^@/, '').trim()
	const parts = cleaned.split(/[\s._-]+/).filter(Boolean)
	if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
	return cleaned.slice(0, 2).toUpperCase()
}

type Size = 'sm' | 'md' | 'lg'

const ring: Record<Size, string> = {
	sm: 'h-9 w-9',
	md: 'h-11 w-11',
	lg: 'h-14 w-14',
}
const initialSize: Record<Size, string> = {
	sm: 'text-xs',
	md: 'text-sm',
	lg: 'text-lg',
}
const badgeSize: Record<Size, { box: string; glyph: number }> = {
	sm: { box: 'h-3.5 w-3.5', glyph: 9 },
	md: { box: 'h-4 w-4', glyph: 10 },
	lg: { box: 'h-5 w-5', glyph: 12 },
}

/**
 * Contact avatar with a small channel glyph badge in the corner — the recurring
 * identity token for a thread (contact initials + originating channel).
 */
export function ThreadAvatar({
	name,
	channelKind,
	size = 'md',
	className,
}: {
	name: string
	channelKind?: ChannelKind
	size?: Size
	className?: string
}) {
	const Glyph = channelKind ? channelGlyph[channelKind] : undefined
	const badge = badgeSize[size]
	return (
		<View className={cn('relative', className)}>
			<View className={cn('items-center justify-center rounded-pill bg-secondary', ring[size])}>
				<Text className={cn('font-sans-bold text-foreground', initialSize[size])}>{initials(name)}</Text>
			</View>
			{Glyph && (
				<View
					className={cn(
						'absolute -bottom-0.5 -right-0.5 items-center justify-center rounded-pill border-2 border-background bg-primary',
						badge.box,
					)}
				>
					<Glyph size={badge.glyph} color={action.onPrimary} strokeWidth={2} />
				</View>
			)}
		</View>
	)
}
