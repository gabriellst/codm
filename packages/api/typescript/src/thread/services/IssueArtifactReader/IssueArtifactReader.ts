import type { ArtifactKind } from '@codm/contracts-typescript/wire/enums'

/** What delivering an issue's preview needs of an artifact row — its kind and where its bytes (or URL) are. */
export interface IssueArtifactFile {
	artifactId: string
	issueId?: string
	kind: ArtifactKind
	/** The name the issue recorded it with — the caption of a print shown on its own (voz do grupo, 25/11). */
	name: string
	/** A local path for the media kinds; the URL for a `LINK`. */
	ref: string
}

/**
 * Reads the artifact a FEEDBACK signal names (fase 3, item 2) — the declared `reads.artifact` of this
 * context, the same table read `GetSessionChat` makes for the artifact bubble. The `thread` delivers the
 * preview when the output policy says so; it never goes through the `artifact` context's use cases (that
 * context already depends on this one, and the signal carries only ids by design).
 */
export abstract class IssueArtifactReader {
	abstract find(artifactId: string): Promise<IssueArtifactFile | undefined>
}
