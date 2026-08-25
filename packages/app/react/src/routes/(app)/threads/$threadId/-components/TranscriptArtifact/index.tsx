import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { Dot } from '@/components/console/StatusDot'
import { enumLabel } from '@/lib'
import { formatTimeOfDay } from '@/lib/format'
import { useLocale } from '@/hooks'
import { cn } from '@/lib/utils'
import { ArtifactPreview, type Artifact } from '../ArtifactPreview'

/**
 * One artifact, in the conversation, at the moment it was produced.
 *
 * It sits on the RIGHT, in the same column as SYSTEM and DIRECT lines, because an artifact is
 * something this side of the conversation made — never something the contact sent. The caption names
 * the kind and, when the artifact belongs to an issue, links to it, exactly as `TranscriptBubble`
 * does for an agent line.
 */
export function TranscriptArtifact({
	artifact,
	caption,
	threadId,
	className,
	...props
}: ComponentProps<'div'> & { artifact: Artifact; caption?: string; threadId: string }) {
	const { t } = useTranslation()
	const locale = useLocale()
	return (
		<div className={cn('flex flex-col items-end gap-1', className)} {...props}>
			<div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
				{artifact.issueId && (
					<Link
						to="/threads/$threadId/issues/$issueId"
						params={{ threadId, issueId: artifact.issueId }}
						className="inline-flex items-center gap-1.5 rounded-asymmetric-3xs bg-muted px-2.5 py-1 font-mono hover:bg-accent"
					>
						<Dot className="bg-primary" /> {t('session.transcriptIssue')}
					</Link>
				)}
				<span>{enumLabel('ArtifactKind', artifact.kind)}</span>
			</div>
			<div className="w-full max-w-[85%]">
				<ArtifactPreview artifact={artifact} threadId={threadId} />
			</div>
			{/* The caption an agent sent an artifact WITH ("envio de artefatos pelo canal", decision 4) —
			    the same free text a SYSTEM text bubble carries, just below the preview instead of instead
			    of it. Absent for a plain `RecordArtifact` card, which never had one to show. */}
			{caption && <p className="w-full max-w-[85%] whitespace-pre-wrap px-1 text-sm text-foreground">{caption}</p>}
			<span className="px-1 text-xs text-muted-foreground">{formatTimeOfDay(artifact.recordedAt, locale)}</span>
		</div>
	)
}
