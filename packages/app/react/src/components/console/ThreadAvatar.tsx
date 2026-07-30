import type { ComponentProps } from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { channelGlyph } from './glyphs'
import type { ChannelKind } from '@codm/client-typescript/typescript'

/** Two-letter initials from a display name ("Rafa Lima" → "RL", "@caio.dev" → "CA"). */
export function initials(name: string): string {
	const cleaned = name.replace(/^@/, '').trim()
	const parts = cleaned.split(/[\s._-]+/).filter(Boolean)
	if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
	return cleaned.slice(0, 2).toUpperCase()
}

type Size = 'sm' | 'default' | 'lg'

/**
 * Contact avatar with a small channel glyph badge in the corner — the recurring
 * identity token for a thread (contact initials + originating channel).
 */
export function ThreadAvatar({
	name,
	channelKind,
	size = 'default',
	className,
	...props
}: ComponentProps<'div'> & {
	name: string
	channelKind?: ChannelKind
	size?: Size
}) {
	const Glyph = channelKind ? channelGlyph[channelKind] : undefined
	const badgeSize = size === 'lg' ? 'size-4' : 'size-3.5'
	return (
		<div className={cn('relative shrink-0', className)} {...props}>
			<Avatar size={size}>
				<AvatarFallback>{initials(name)}</AvatarFallback>
			</Avatar>
			{Glyph && (
				<span
					className={cn(
						'absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background',
						badgeSize,
					)}
				>
					<Glyph className="size-2.5" />
				</span>
			)}
		</div>
	)
}
