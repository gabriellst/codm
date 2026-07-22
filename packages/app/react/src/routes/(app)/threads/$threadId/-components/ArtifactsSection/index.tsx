import { IconFile, IconLink, IconPhoto } from '@tabler/icons-react'
import type { Icon } from '@tabler/icons-react'
import { useListArtifacts } from '@codedm/client-typescript/typescript'
import type { ArtifactKind, ListArtifactsQueryResponse } from '@codedm/client-typescript/typescript'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty'
import { artifactKindLabel } from '@/components/console/glyphs'

type Artifact = ListArtifactsQueryResponse['artifacts'][number]

const artifactGlyph: Record<ArtifactKind, Icon> = { IMAGE: IconPhoto, FILE: IconFile, LINK: IconLink }

/** The non-code outputs of a thread — preview deploys, screenshots, files (T13). */
export function ArtifactsSection({ threadId }: { threadId: string }) {
	const { data, isLoading } = useListArtifacts(threadId)
	const artifacts = data?.artifacts ?? []

	if (isLoading) {
		return (
			<div className="grid gap-4 py-4 sm:grid-cols-2">
				<Skeleton className="h-40 rounded-2xl" />
				<Skeleton className="h-40 rounded-2xl" />
			</div>
		)
	}

	if (artifacts.length === 0) {
		return (
			<Empty className="py-16">
				<EmptyTitle>No artifacts yet</EmptyTitle>
				<EmptyDescription>Preview deploys, screenshots and files produced by your agents land here.</EmptyDescription>
			</Empty>
		)
	}

	return (
		<div className="grid gap-4 py-4 sm:grid-cols-2">
			{artifacts.map(artifact => (
				<ArtifactCard key={artifact.artifactId} artifact={artifact} />
			))}
		</div>
	)
}

function ArtifactCard({ artifact }: { artifact: Artifact }) {
	const Glyph = artifactGlyph[artifact.kind]
	return (
		<div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
			{artifact.kind === 'IMAGE' && (
				<div
					className="h-32 w-full border-b border-border"
					style={{
						backgroundImage: 'repeating-linear-gradient(45deg, oklch(0.95 0 0) 0 10px, oklch(0.92 0 0) 10px 20px)',
					}}
				/>
			)}
			<div className="flex items-start gap-3 p-4">
				<span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground">
					<Glyph className="size-4" />
				</span>
				<div className="flex min-w-0 flex-1 flex-col">
					<span className="truncate font-medium text-foreground">{artifact.name}</span>
					<span className="truncate text-sm text-muted-foreground">
						{artifactKindLabel[artifact.kind]} · {artifact.meta}
					</span>
				</div>
			</div>
		</div>
	)
}
