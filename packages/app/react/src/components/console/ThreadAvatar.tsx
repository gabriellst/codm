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
	// Badge is ~50% of the avatar's diameter (reference measurement). `sm` gets its own step —
	// at `size-3.5` it read as 58% of a `size-6` avatar and ate into the initials.
	const badgeSize = size === 'lg' ? 'size-4' : size === 'sm' ? 'size-3' : 'size-3.5'
	return (
		<div className={cn('relative shrink-0', className)} {...props}>
			<Avatar size={size}>
				<AvatarFallback>{initials(name)}</AvatarFallback>
			</Avatar>
			{Glyph && (
				<span
					className={cn(
						// Escuro, não verde: na referência o selo é um círculo quase preto com o glifo branco. O
						// verde já é a cor do avatar; repeti-lo aqui apagava o contraste entre os dois.
						'absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full bg-foreground text-background ring-2 ring-background',
						badgeSize,
					)}
				>
					<Glyph className="size-2.5" />
				</span>
			)}
		</div>
	)
}
