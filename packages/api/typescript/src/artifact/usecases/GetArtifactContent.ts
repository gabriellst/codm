import { injectable } from 'tsyringe-neo'
import { stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { Handler, z, BaseError, MimeTypeExtractor } from '@codm/core-typescript'
import { ArtifactKind } from '@codm/contracts-typescript/wire/enums'
import { ArtifactRepository } from '../repositories/ArtifactRepository'
import type { ApplicationErrors } from '../errors'

export const GetArtifactContentInputSchema = z.object({
	ownerId: z.uuid(),
	threadId: z.uuid(),
	artifactId: z.uuid(),
})

export const GetArtifactContentOutputSchema = z.object({
	/** Absolute path on the operator's disk. Resolved from the ROW — never from the request. */
	path: z.string(),
	fileName: z.string(),
	contentType: z.string(),
	size: z.number().int().nonnegative(),
})

/**
 * Resolve the bytes behind one artifact — the read the console needs and an agent does not.
 *
 * ### The path is never an input
 * The request carries two ids and nothing else. `ref` comes out of the artifact row, so the set of
 * files this can ever name is exactly the set some agent already recorded against a thread of this
 * owner. There is no traversal to defend against because there is no path to traverse: no string
 * from the caller participates in resolving the file.
 *
 * ### Four ways to be absent, one answer
 * Unknown id, another owner's artifact, an artifact of a different thread than the path names, and a
 * file that is no longer on disk all answer `ARTIFACT_NOT_FOUND`. The console's fallback for all
 * four is the same (show the file row with its path), and distinguishing them would only tell a
 * caller which ids exist.
 *
 * ### `LINK` has no bytes here
 * A LINK artifact's `ref` is a URL pointing at somebody else's server. Fetching it on the operator's
 * behalf would make the daemon a proxy for arbitrary URLs an agent wrote down — a different, much
 * larger thing than serving a local file. The console opens LINK artifacts with an anchor, which is
 * the browser doing what browsers do.
 */
@injectable()
export class GetArtifactContent extends Handler<typeof GetArtifactContentInputSchema, typeof GetArtifactContentOutputSchema> {
	readonly name = 'get_artifact_content' as const
	readonly inputSchema = GetArtifactContentInputSchema
	readonly outputSchema = GetArtifactContentOutputSchema

	constructor(private readonly artifacts: ArtifactRepository) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const artifact = await this.artifacts.findById(input.artifactId)
		if (!artifact || artifact.ownerId !== input.ownerId || artifact.threadId !== input.threadId)
			throw new BaseError<ApplicationErrors>('ARTIFACT_NOT_FOUND', `no artifact ${input.artifactId} on thread ${input.threadId}`)

		if (artifact.kind === ArtifactKind.LINK)
			throw new BaseError<ApplicationErrors>('ARTIFACT_NOT_PREVIEWABLE', `artifact ${input.artifactId} is a LINK — it has no local bytes`)

		const stats = await stat(artifact.ref).catch(() => undefined)
		if (!stats?.isFile())
			throw new BaseError<ApplicationErrors>('ARTIFACT_NOT_FOUND', `artifact ${input.artifactId} no longer has a file at its ref`)

		return {
			path: artifact.ref,
			fileName: basename(artifact.ref),
			contentType: MimeTypeExtractor.extractMimeType(artifact.ref),
			size: stats.size,
		}
	}
}
