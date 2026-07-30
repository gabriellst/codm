import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import type { GetSessionChatQueryResponse } from '@codm/client-typescript/typescript'
import { cn } from '@/lib/utils'
import { enumLabel } from '@/lib'
import { providerLabel } from '@/components/console/glyphs'
import { Dot } from '@/components/console/StatusDot'

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
		return (
			<div className={cn('flex flex-col items-start gap-1', className)} {...props}>
				<div className="max-w-[85%] rounded-2xl rounded-tl-md bg-secondary px-4 py-2.5 text-foreground">{entry.text}</div>
				<span className="px-1 text-xs text-muted-foreground">{entry.at}</span>
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
					'max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-md px-4 py-2.5',
					isWhisper ? 'border border-dashed border-border bg-muted italic text-muted-foreground' : 'bg-primary text-primary-foreground',
				)}
			>
				{entry.text}
			</div>
			<span className="px-1 text-xs text-muted-foreground">{entry.at}</span>
		</div>
	)
}
