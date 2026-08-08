import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import type { GetSessionChatQueryResponse } from '@codm/client-typescript/typescript'
import { cn } from '@/lib/utils'
import { enumLabel } from '@/lib'
import { providerLabel } from '@/components/console/glyphs'
import { Dot } from '@/components/console/StatusDot'
import { ThreadAvatar, contactAvatarUrl } from '@/components/console/ThreadAvatar'

type Entry = GetSessionChatQueryResponse['transcript'][number]

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
				<Dot className="mt-1.5 bg-muted-foreground/50" />
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
				<div className="flex min-w-0 flex-col items-start gap-1">
					{/* bg-secondary carries text-secondary-foreground — the pair is the design system's one
					    rule with no exceptions (tokens.css). It read `text-foreground` before, which in light
					    mode put near-black on the pale green instead of the green the pairing specifies. */}
					<div className="max-w-full whitespace-pre-wrap rounded-2xl rounded-tl-md bg-secondary px-4 py-2.5 text-secondary-foreground">
						{sender && <span className="mb-0.5 block text-xs font-medium text-secondary-foreground/70">{sender.displayName}</span>}
						{entry.text}
					</div>
					<span className="px-1 text-xs text-muted-foreground">{entry.at}</span>
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
						className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 font-mono hover:bg-muted"
					>
						<Dot className="bg-info" /> {t('session.transcriptIssue')}
					</Link>
				)}
				<span>{caption}</span>
			</div>
			<div
				className={cn(
					'max-w-full whitespace-pre-wrap rounded-2xl rounded-tr-md px-4 py-2.5',
					isWhisper ? 'border border-dashed border-border bg-muted italic text-muted-foreground' : 'bg-primary text-primary-foreground',
				)}
			>
				{entry.text}
			</div>
			<span className="px-1 text-xs text-muted-foreground">{entry.at}</span>
		</div>
	)
}
