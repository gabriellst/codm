import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useListArtifacts } from '@codm/client-typescript/typescript'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty'
import { enumLabel } from '@/lib'
import { cn } from '@/lib/utils'
import { ArtifactPreview, artifactGlyph, type Artifact } from '../ArtifactPreview'

/**
 * The non-code outputs of a thread (T13) — the CATALOGUE half of the same preview the conversation
 * shows inline. Both render through `ArtifactPreview`, which is what stops a screenshot from being
 * one thing here and another thing there.
 *
 * This section used to draw its own idea of an artifact: a 128px band of diagonal grey stripes where
 * an IMAGE belonged, and a LINK printed as dead text. Neither was a rendering bug — `ref` did not
 * cross the wire at all, so there was nothing to render and the stripes were standing in for a
 * missing field.
 */
export function ArtifactsSection({ threadId, className, ...props }: ComponentProps<'div'> & { threadId: string }) {
	const { t } = useTranslation()
	const { data, isLoading } = useListArtifacts(threadId)
	const artifacts = data?.artifacts ?? []

	if (isLoading) {
		return (
			<div className={cn('grid gap-4 py-4 sm:grid-cols-2', className)} {...props}>
				<Skeleton className="h-40 rounded-2xl" />
				<Skeleton className="h-40 rounded-2xl" />
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
		<div className={cn('grid gap-4 py-4 sm:grid-cols-2', className)} {...props}>
			{artifacts.map(artifact => (
				<ArtifactCard key={artifact.artifactId} artifact={artifact} threadId={threadId} />
			))}
		</div>
	)
}

function ArtifactCard({ artifact, threadId }: { artifact: Artifact; threadId: string }) {
	const Glyph = artifactGlyph[artifact.kind]
	return (
		<div className="flex flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-card p-4">
			<ArtifactPreview artifact={artifact} threadId={threadId} />
			<div className="flex items-start gap-3">
				<span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground">
					<Glyph className="size-4" />
				</span>
				<div className="flex min-w-0 flex-1 flex-col gap-1.5">
					<span className="truncate font-medium text-foreground">{artifact.name}</span>
					<span className="truncate text-sm text-muted-foreground">
						{enumLabel('ArtifactKind', artifact.kind)}
						{artifact.meta && ` · ${artifact.meta}`}
					</span>
				</div>
			</div>
		</div>
	)
}
