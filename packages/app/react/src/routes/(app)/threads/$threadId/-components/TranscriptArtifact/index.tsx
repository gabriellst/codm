import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { Dot } from '@/components/console/StatusDot'
import { enumLabel } from '@/lib'
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
	threadId,
	className,
	...props
}: ComponentProps<'div'> & { artifact: Artifact; threadId: string }) {
	const { t } = useTranslation()
	return (
		<div className={cn('flex flex-col items-end gap-1', className)} {...props}>
			<div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
				{artifact.issueId && (
					<Link
						to="/threads/$threadId/issues/$issueId"
						params={{ threadId, issueId: artifact.issueId }}
						className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 font-mono hover:bg-muted"
					>
						<Dot className="bg-info" /> {t('session.transcriptIssue')}
					</Link>
				)}
				<span>{enumLabel('ArtifactKind', artifact.kind)}</span>
			</div>
			<div className="w-full max-w-[85%]">
				<ArtifactPreview artifact={artifact} threadId={threadId} />
			</div>
			<span className="px-1 text-xs text-muted-foreground">{artifact.recordedAt}</span>
		</div>
	)
}
