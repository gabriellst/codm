import { type ComponentProps, type ComponentType, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconExternalLink, IconFile, IconLink, IconMovie, IconMusic, IconPhoto } from '@tabler/icons-react'
import type { Icon } from '@tabler/icons-react'
import { getArtifactContentQueryKey } from '@codm/client-typescript/typescript'
import type { ArtifactKind, ListArtifactsQueryResponse } from '@codm/client-typescript/typescript'
import { daemonBaseUrl } from '@/lib/config'
import { cn } from '@/lib/utils'
import { enumLabel } from '@/lib'
import { useDialogStore } from '@/stores/useDialogStore'
import { DialogContent, DialogHeader, DialogTitle } from '@codm/app-ui/dialog'

export type Artifact = ListArtifactsQueryResponse['artifacts'][number]

/** The glyph that stands for a kind — icon map, not a label map (labels are i18n's job). */
export const artifactGlyph: Record<ArtifactKind, Icon> = {
	IMAGE: IconPhoto,
	AUDIO: IconMusic,
	VIDEO: IconMovie,
	FILE: IconFile,
	LINK: IconLink,
}

/**
 * Where the browser fetches an artifact's BYTES.
 *
 * The path comes from the SDK's own query key and the origin comes from the app config — the same
 * split `useTerminalStream` uses for the SSE tail, and for the same reason: an `<img src>` is not a
 * `fetch`, so it cannot ride the generated ky client, but it must not therefore become a hand-typed
 * path that drifts when the controller's route changes.
 */
export function artifactContentUrl(threadId: string, artifactId: string): string {
	const path = getArtifactContentQueryKey(threadId, artifactId)[0].url.replace(':threadId', threadId).replace(':artifactId', artifactId)
	return `${daemonBaseUrl()}${path}`
}

export interface ArtifactPreviewProps extends ComponentProps<'div'> {
	artifact: Artifact
	threadId: string
}

/**
 * ONE artifact, rendered as itself.
 *
 * The dispatch is a module-level `Record<ArtifactKind, …>` — exhaustive by construction, so a kind
 * added to the contract is a `tsc` error here rather than a silently blank card (`CMP-P18`). Before
 * this component the console drew a striped `repeating-linear-gradient` where an image belonged and
 * printed a LINK's name with no href, which is what happens when a preview is a picture OF a kind
 * instead of the thing itself.
 *
 * ### A missing file is a normal outcome
 * `ref` points at the operator's disk and agents write to `/tmp`, which gets swept. Every media
 * variant therefore falls back to the FILE row on load failure: the path is the useful remainder,
 * and a broken-image icon is not.
 */
export function ArtifactPreview({ artifact, threadId, className, ...props }: ArtifactPreviewProps) {
	const Variant = artifactPreviewVariant[artifact.kind]
	return (
		<div className={cn('flex flex-col gap-2', className)} {...props}>
			<Variant artifact={artifact} threadId={threadId} />
		</div>
	)
}

interface VariantProps {
	artifact: Artifact
	threadId: string
}

function ImagePreview({ artifact, threadId, className, ...props }: ComponentProps<'button'> & VariantProps) {
	const { t } = useTranslation()
	const show = useDialogStore(state => state.show)
	// LOAD-FAILURE FALLBACK: local, transient, private to this render — the one sanctioned useState.
	const [broken, setBroken] = useState(false)
	const src = artifactContentUrl(threadId, artifact.artifactId)

	if (broken) return <FilePreview artifact={artifact} threadId={threadId} />

	return (
		<button
			type="button"
			onClick={() => show(<ArtifactLightbox artifact={artifact} threadId={threadId} />)}
			className={cn('group overflow-hidden rounded-xl border border-border bg-muted', className)}
			aria-label={t('session.artifactOpenFull', { name: artifact.name })}
			{...props}
		>
			<img
				src={src}
				alt={artifact.name}
				onError={() => setBroken(true)}
				className="max-h-80 w-full object-contain transition-opacity group-hover:opacity-90"
			/>
		</button>
	)
}

function VideoPreview({ artifact, threadId, className, ...props }: ComponentProps<'video'> & VariantProps) {
	const [broken, setBroken] = useState(false)
	if (broken) return <FilePreview artifact={artifact} threadId={threadId} />
	return (
		// biome-ignore lint/a11y/useMediaCaption: an agent's screen recording has no caption track to offer.
		<video
			src={artifactContentUrl(threadId, artifact.artifactId)}
			controls
			preload="metadata"
			onError={() => setBroken(true)}
			className={cn('max-h-80 w-full rounded-xl border border-border bg-black', className)}
			{...props}
		/>
	)
}

function AudioPreview({ artifact, threadId, className, ...props }: ComponentProps<'audio'> & VariantProps) {
	const [broken, setBroken] = useState(false)
	if (broken) return <FilePreview artifact={artifact} threadId={threadId} />
	return (
		// biome-ignore lint/a11y/useMediaCaption: a voice note has no caption track to offer.
		<audio
			src={artifactContentUrl(threadId, artifact.artifactId)}
			controls
			preload="metadata"
			onError={() => setBroken(true)}
			className={cn('w-full', className)}
			{...props}
		/>
	)
}

/** A LINK's whole content IS its ref — so the card is the anchor, not a card with an anchor in it. */
function LinkPreview({ artifact, threadId, className, ...props }: ComponentProps<'a'> & VariantProps) {
	return (
		<a
			href={artifact.ref}
			target="_blank"
			rel="noreferrer noopener"
			className={cn('flex items-start gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-muted', className)}
			{...props}
		>
			<span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground">
				<IconLink className="size-4" />
			</span>
			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="truncate font-medium text-foreground">{artifact.name}</span>
				<span className="truncate text-sm text-muted-foreground">{artifact.ref}</span>
			</span>
			<IconExternalLink className="size-4 shrink-0 text-muted-foreground" />
		</a>
	)
}

/**
 * The row every non-previewable artifact gets — and the fallback every previewable one falls back
 * to. Opening it goes through the same content endpoint the players use, so a PDF or a `.zip` is one
 * click away without the console having to know how to render it.
 */
function FilePreview({ artifact, threadId, className, ...props }: ComponentProps<'a'> & VariantProps) {
	const Glyph = artifactGlyph[artifact.kind]
	return (
		<a
			href={artifactContentUrl(threadId, artifact.artifactId)}
			target="_blank"
			rel="noreferrer noopener"
			className={cn('flex items-start gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-muted', className)}
			{...props}
		>
			<span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground">
				<Glyph className="size-4" />
			</span>
			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="truncate font-medium text-foreground">{artifact.name}</span>
				<span className="truncate text-sm text-muted-foreground">{artifact.ref}</span>
			</span>
			<IconExternalLink className="size-4 shrink-0 text-muted-foreground" />
		</a>
	)
}

const artifactPreviewVariant: Record<ArtifactKind, ComponentType<VariantProps>> = {
	IMAGE: ImagePreview,
	AUDIO: AudioPreview,
	VIDEO: VideoPreview,
	FILE: FilePreview,
	LINK: LinkPreview,
}

/** The full-size image, in the store-driven dialog — opened by clicking the inline thumbnail. */
function ArtifactLightbox({ artifact, threadId, className, ...props }: ComponentProps<typeof DialogContent> & VariantProps) {
	const { t } = useTranslation()
	return (
		<DialogContent className={cn('max-w-4xl', className)} {...props}>
			<DialogHeader>
				<DialogTitle>{artifact.name}</DialogTitle>
			</DialogHeader>
			<img
				src={artifactContentUrl(threadId, artifact.artifactId)}
				alt={artifact.name}
				className="max-h-[70vh] w-full rounded-lg object-contain"
			/>
			<p className="truncate text-sm text-muted-foreground">
				{enumLabel('ArtifactKind', artifact.kind)} · {artifact.ref}
			</p>
			<a
				href={artifactContentUrl(threadId, artifact.artifactId)}
				target="_blank"
				rel="noreferrer noopener"
				className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
			>
				<IconExternalLink className="size-4" /> {t('session.artifactOpenExternally')}
			</a>
		</DialogContent>
	)
}
