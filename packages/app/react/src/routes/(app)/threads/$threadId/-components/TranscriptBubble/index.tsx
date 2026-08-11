import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import type { GetSessionChatQueryResponse } from '@codm/client-typescript/typescript'
import { cn } from '@/lib/utils'
import { enumLabel } from '@/lib'
import { formatTimeOfDay } from '@/lib/format'
import { useLocale } from '@/hooks'
import { providerLabel } from '@/components/console/glyphs'
import { Dot } from '@/components/console/StatusDot'
import { ThreadAvatar, contactAvatarUrl } from '@/components/console/ThreadAvatar'

type Entry = GetSessionChatQueryResponse['transcript'][number]

/**
 * O HORÁRIO DENTRO DO BALÃO, no canto inferior direito — o gesto do WhatsApp, e não um rótulo solto
 * embaixo da bolha (que era o que havia aqui: um `<span>` irmão, empurrando cada linha da conversa
 * uma altura de texto para baixo sem dizer nada a mais).
 *
 * SÃO DOIS ELEMENTOS PARA UM SÓ HORÁRIO, e o par é a técnica inteira:
 *
 *  1. O ESPAÇADOR (`invisible`, mas ocupando espaço) entra no fluxo do texto, logo depois dele.
 *     `visibility:hidden` reserva a caixa; `display:none` não reservaria nada. Ele é uma cópia do
 *     próprio horário, então mede a largura EXATA em qualquer locale — `"05:25"` em pt-BR e
 *     `"05:25 AM"` em en-US não são a mesma coisa, e uma largura fixa chutada erraria uma das duas.
 *     É ele que faz o texto fluir ao redor: se a última linha não comporta o horário, o espaçador
 *     quebra sozinho e o balão cresce uma linha — exatamente o que o WhatsApp faz.
 *  2. O HORÁRIO DE VERDADE sai do fluxo (`absolute`), ancorado no canto do balão. Fora do fluxo ele
 *     não interfere na quebra do texto; dentro do espaço que o espaçador reservou, não o cobre.
 *
 * A COR vem do PRÓPRIO balão com opacidade, nunca de `text-muted-foreground`: o balão de saída é
 * `bg-bubble-out` (verde de marca, alias de `--primary`) e o de entrada `bg-bubble-in` (verde
 * pastel, alias de `--secondary`) — um cinza de texto neutro por cima de qualquer um dos dois é
 * ilegível. `text-bubble-out-fg/70` é o mesmo texto que o balão já usa, só mais discreto, então o
 * contraste é o do par de tokens, por construção. Os alias `--bubble-*` (tokens.css) existem para
 * que a cor do balão possa um dia divergir da cor do botão sem tocar 64 call sites de `variant`.
 */
function BubbleTime({ at, className, ...props }: ComponentProps<'span'> & { at: string }) {
	const locale = useLocale()
	const time = formatTimeOfDay(at, locale)
	return (
		<>
			<span aria-hidden="true" className="invisible ml-2 inline-block select-none text-[11px] leading-none">
				{time}
			</span>
			<span className={cn('absolute bottom-2 right-4 text-[11px] leading-none', className)} {...props}>
				{time}
			</span>
		</>
	)
}

/**
 * One transcript line. CONTACT sits left in a soft bubble; SYSTEM / DIRECT sit
 * right in a dark bubble; WHISPER is a right-aligned agents-only aside; ACTION is a
 * full-width system line (classifications, edits, test runs).
 */
export function TranscriptBubble({ entry, threadId, className, ...props }: ComponentProps<'div'> & { entry: Entry; threadId: string }) {
	const { t } = useTranslation()
	if (entry.kind === 'ACTION') {
		return (
			<div className={cn('flex items-start gap-2 py-1 text-sm text-muted-foreground', className)} {...props}>
				<Dot className="mt-1.5 bg-primary" />
				<span className="flex-1">{entry.text}</span>
			</div>
		)
	}

	if (entry.kind === 'CONTACT') {
		// WHO TYPED IT. Before the read model carried this, an inbound bubble was text and a time and
		// nothing else — readable in a 1:1, where the header names the one other person, and simply not
		// recoverable in a GROUP, where every inbound line is somebody different.
		//
		// `sender` is optional on the wire and absent here for a reason worth keeping: this same
		// component renders the messages ROUTED TO AN ISSUE (`GetIssueDetail.routedMessages`), a
		// narrower payload that carries no identity. Photo and name simply don't appear there; the
		// bubble degrades to what it always was.
		const sender = entry.sender
		return (
			<div className={cn('flex items-start gap-2', className)} {...props}>
				{sender && (
					<ThreadAvatar
						size="sm"
						name={sender.displayName}
						// No photo in the gateway's book → no url at all, and the avatar draws initials. The
						// browser never learns the platform's own (signed, expiring) url: this one points at
						// the daemon, which fetched it once and cached it.
						src={sender.hasAvatar ? contactAvatarUrl(sender.channelId, sender.externalId) : undefined}
					/>
				)}
				{/* bg-bubble-in carries text-bubble-in-fg — the pair is the design system's one rule with
				    no exceptions (tokens.css). It read `text-foreground` before, which in light mode put
				    near-black on the pale green instead of the green the pairing specifies.
				    `rounded-asymmetric-md` (Q6TEB, hLcjH: every bubble measures [18,18,18,6] — the flat
				    corner is NOT mirrored per role, contrary to the old `rounded-tl-md`/`rounded-tr-md`
				    per-side guess) replaces the old radius. `relative` é a âncora do horário; ver
				    `BubbleTime`. */}
				<div className="relative min-w-0 max-w-full whitespace-pre-wrap rounded-asymmetric-md bg-bubble-in px-4 py-2.5 text-bubble-in-fg">
					{sender && <span className="mb-0.5 block text-xs font-medium text-bubble-in-fg/70">{sender.displayName}</span>}
					{entry.text}
					<BubbleTime at={entry.at} className="text-bubble-in-fg/60" />
				</div>
			</div>
		)
	}

	const isWhisper = entry.kind === 'WHISPER'
	// The caption is WHO said this, and it comes from the SAME `TranscriptKind` vocabulary the home
	// page's activity list uses — one set of words for one concept, translated in one place. It used to
	// be three English literals ('Agent' / 'Whisper' / 'You') sitting in an otherwise translated screen.
	// A SYSTEM line names the actual CLI when it knows it, which is more specific than "Agente".
	const caption = entry.kind === 'SYSTEM' && entry.provider ? providerLabel[entry.provider] : enumLabel('TranscriptKind', entry.kind)

	return (
		<div className={cn('flex flex-col items-end gap-1', className)} {...props}>
			<div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
				{entry.issueId && (
					<Link
						to="/threads/$threadId/issues/$issueId"
						params={{ threadId, issueId: entry.issueId }}
						className="inline-flex items-center gap-1.5 rounded-asymmetric-3xs bg-muted px-2.5 py-1 font-mono hover:bg-accent"
					>
						<Dot className="bg-primary" /> {t('session.transcriptIssue')}
					</Link>
				)}
				<span>{caption}</span>
			</div>
			<div
				className={cn(
					'relative max-w-full whitespace-pre-wrap rounded-asymmetric-md px-4 py-2.5',
					isWhisper ? 'border border-input bg-background italic text-muted-foreground' : 'bg-bubble-out text-bubble-out-fg',
				)}
			>
				{entry.text}
				<BubbleTime at={entry.at} className={isWhisper ? 'not-italic text-muted-foreground/70' : 'text-bubble-out-fg/70'} />
			</div>
		</div>
	)
}
