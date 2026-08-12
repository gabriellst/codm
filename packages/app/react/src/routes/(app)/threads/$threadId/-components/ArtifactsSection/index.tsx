import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { IconExternalLink } from '@tabler/icons-react'
import { ArtifactKindEnum, useListArtifacts } from '@codm/client-typescript/typescript'
import type { ArtifactKind } from '@codm/client-typescript/typescript'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty'
import { sectionLabelBare } from '@/components/ui/surfaces'
import { enumLabel } from '@/lib'
import { formatRelativeTime } from '@/lib/format'
import { useLocale } from '@/hooks'
import { cn } from '@/lib/utils'
import { ArtifactPreview, artifactContentUrl, artifactGlyph, type Artifact } from '../ArtifactPreview'

/**
 * The non-code outputs of a thread (T13) — the CATALOGUE half of the same preview the conversation
 * shows inline (`TranscriptArtifact`). This grid card is its own layout (Q6TEB, Z17jOD): a fixed-height
 * Thumb band over a Name/Detail/Footer meta block, 3-up — not the loose 2-column bordered rectangle
 * this section drew before.
 *
 * ### Why the Thumb dispatch is LOCAL, not `ArtifactPreview`'s job
 * `.pen` cannot embed a live image/video, so the reference stands a generic icon-on-tint in for every
 * non-previewable kind — including IMAGE, where the real console DOES have working pixels to show
 * (`ArtifactPreview`'s `<img>`, with its own broken-file fallback). Copying the mock literally would
 * regress a real image back to a placeholder icon, which is the console knowing something the design
 * mock couldn't: código vence here. So real media (IMAGE, VIDEO) still renders through
 * `ArtifactPreview`, cropped to the Thumb band via child-selector overrides; AUDIO has no useful
 * thumbnail at this size (no waveform in the reference either) and FILE/LINK's own preview is a
 * named row meant for the transcript, not a square thumb — those three get the reference's plain
 * icon-on-tint treatment instead, with the name/detail that row would have shown moved into Meta
 * below (which every kind now gets, uniformly).
 */
export function ArtifactsSection({ threadId, className, ...props }: ComponentProps<'div'> & { threadId: string }) {
	const { t } = useTranslation()
	const { data, isLoading } = useListArtifacts(threadId)
	const artifacts = data?.artifacts ?? []

	if (isLoading) {
		return (
			<div className={cn('flex flex-col gap-4 py-4', className)} {...props}>
				<Skeleton className="h-5 w-32" />
				<div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
					<Skeleton className="h-48 rounded-asymmetric-lg" />
					<Skeleton className="h-48 rounded-asymmetric-lg" />
					<Skeleton className="h-48 rounded-asymmetric-lg" />
				</div>
			</div>
		)
	}

	if (artifacts.length === 0) {
		return (
			<Empty className={cn('py-16', className)} {...props}>
				<EmptyTitle>{t('session.artifactsEmptyTitle')}</EmptyTitle>
				<EmptyDescription>{t('session.artifactsEmptyDescription')}</EmptyDescription>
			</Empty>
		)
	}

	return (
		<div className={cn('flex flex-col gap-4 py-4', className)} {...props}>
			<h2 className={cn(sectionLabelBare, 'px-2')}>{t('session.tabArtifacts')}</h2>
			<div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{artifacts.map(artifact => (
					<ArtifactCard key={artifact.artifactId} artifact={artifact} threadId={threadId} />
				))}
			</div>
		</div>
	)
}

/** Kinds `ArtifactPreview` can render as real, working media at thumbnail size. */
const MEDIA_KINDS: ReadonlySet<ArtifactKind> = new Set<ArtifactKind>([ArtifactKindEnum.IMAGE, ArtifactKindEnum.VIDEO])

interface ArtifactCardProps extends ComponentProps<'div'> {
	artifact: Artifact
	threadId: string
}

function ArtifactCard({ artifact, threadId, className, ...props }: ArtifactCardProps) {
	const { t } = useTranslation()
	const locale = useLocale()
	const Glyph = artifactGlyph[artifact.kind]
	const isLink = artifact.kind === ArtifactKindEnum.LINK
	const openHref = isLink ? artifact.ref : artifactContentUrl(threadId, artifact.artifactId)

	return (
		<div className={cn('flex flex-col overflow-hidden rounded-asymmetric-lg border border-border bg-background', className)} {...props}>
			<div
				className={cn(
					'h-26 shrink-0 overflow-hidden',
					// child-selector overrides let the real media fill the fixed-height band without
					// touching ArtifactPreview's own markup — see the file-level note above. `size-full`
					// on a descendant only resolves against a parent with a DEFINITE height, so the chain
					// has to be unbroken from this h-26 box down: ArtifactPreview's own root div first
					// (`[&>div]`, its only child), then button/img/video inside it.
					'[&>div]:size-full [&_button]:size-full [&_button]:rounded-none [&_button]:border-0 [&_img]:size-full [&_img]:rounded-none [&_img]:object-cover [&_video]:size-full [&_video]:rounded-none [&_video]:object-cover',
				)}
			>
				{MEDIA_KINDS.has(artifact.kind) ? (
					<ArtifactPreview artifact={artifact} threadId={threadId} />
				) : (
					<div className={cn('flex size-full items-center justify-center', isLink ? 'bg-secondary' : 'bg-accent')}>
						<Glyph className={cn('size-8', isLink ? 'text-secondary-foreground' : 'text-muted-foreground')} />
					</div>
				)}
			</div>
			<div className="flex flex-col gap-2 p-3">
				<div className="flex flex-col gap-0.5">
					<span className="truncate text-sm font-bold text-foreground">{artifact.name}</span>
					{artifact.meta && <span className="truncate text-xs text-caption-foreground">{artifact.meta}</span>}
				</div>
				<div className="flex items-center gap-2">
					<span className="text-[11px] font-semibold text-muted-foreground">{enumLabel('ArtifactKind', artifact.kind)}</span>
					<span className="ml-auto truncate text-xs text-caption-foreground">{formatRelativeTime(artifact.recordedAt, locale)}</span>
					<a
						href={openHref}
						target="_blank"
						rel="noreferrer noopener"
						aria-label={t('session.artifactOpenExternally')}
						title={t('session.artifactOpenExternally')}
						className="shrink-0 text-muted-foreground hover:text-foreground"
					>
						<IconExternalLink className="size-4" />
					</a>
				</div>
			</div>
		</div>
	)
}
