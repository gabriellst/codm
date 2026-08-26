import type { ComponentProps } from 'react'
import { getContactAvatarQueryKey } from '@codm/client-typescript/typescript'
import { Avatar, AvatarFallback, AvatarImage } from '@codm/app-ui/avatar'
import { Config } from '@/lib/config'
import { cn } from '@/lib/utils'
import { channelGlyph } from './glyphs'
import type { ChannelKind } from '@codm/client-typescript/typescript'

/** Two-letter initials from a display name ("Maria Silva" → "MS", "@joao.dev" → "JO"). */
export function initials(name: string): string {
	const cleaned = name.replace(/^@/, '').trim()
	const parts = cleaned.split(/[\s._-]+/).filter(Boolean)
	if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
	return cleaned.slice(0, 2).toUpperCase()
}

/**
 * Where the browser fetches a contact's PHOTO — the daemon, never the platform's CDN.
 *
 * The path comes from the SDK's own query key and the origin from the app config, the same split
 * `artifactContentUrl` uses and for the same reason: an `<img src>` is not a `fetch`, so it cannot
 * ride the generated ky client, but it must not therefore become a hand-typed path that drifts when
 * the controller's route changes.
 *
 * `remoteId` is a WhatsApp JID (`5511…@s.whatsapp.net`) — a path SEGMENT carrying an `@`, so it is
 * encoded rather than interpolated raw.
 */
export function contactAvatarUrl(channelId: string, remoteId: string): string {
	const path = getContactAvatarQueryKey(channelId, remoteId)[0]
		.url.replace(':channelId', encodeURIComponent(channelId))
		.replace(':remoteId', encodeURIComponent(remoteId))
	return `${Config.baseUrl}${path}`
}

type Size = 'sm' | 'default' | 'lg'

/**
 * Contact avatar with a small channel glyph badge in the corner — the recurring
 * identity token for a thread (contact photo or initials + originating channel).
 *
 * `src` is optional and the initials are not a placeholder for it — they are the answer whenever
 * there is no photo, which is a third of the real contact book. `AvatarImage` (Base UI) only reveals
 * itself once the image actually LOADS, so an expired or refused url falls back to the fallback with
 * no `onError` bookkeeping of our own.
 */
export function ThreadAvatar({
	name,
	src,
	channelKind,
	size = 'default',
	className,
	...props
}: ComponentProps<'div'> & {
	name: string
	src?: string
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
				{src && <AvatarImage src={src} alt={name} />}
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
