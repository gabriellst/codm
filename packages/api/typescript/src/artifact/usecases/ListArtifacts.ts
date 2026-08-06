import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@codm/core-typescript'
import { ArtifactKind } from '@codm/contracts-typescript/wire/enums'
import { ArtifactRepository } from '../repositories/ArtifactRepository'

export const ListArtifactsInputSchema = z.object({ ownerId: z.uuid(), threadId: z.uuid() })
export const ListArtifactsOutputSchema = z.object({
	artifacts: z.array(
		z.object({
			artifactId: z.uuid(),
			issueId: z.uuid().optional(),
			kind: z.enum(ArtifactKind),
			name: z.string(),
			/**
			 * WHERE the artifact is: a URL for `LINK` (which is the whole content of that kind — the
			 * console renders it as the anchor's href), a path on the operator's disk for every other
			 * kind (which the console shows as the caption, and whose BYTES come from
			 * `GET /threads/:threadId/artifacts/:artifactId/content`).
			 *
			 * It used to be withheld, and withholding it is what made the artifacts tab a list of names
			 * with nothing behind them: a LINK that could not be clicked and an IMAGE drawn as a striped
			 * placeholder, because the identifier of the thing was the one field that did not cross.
			 */
			ref: z.string(),
			meta: z.string(),
			recordedAt: z.string(),
		}),
	),
})

/** Read — Artifacts (T13). The non-code outputs of a thread, newest first. */
@injectable()
export class ListArtifacts extends Handler<typeof ListArtifactsInputSchema, typeof ListArtifactsOutputSchema> {
	readonly name = 'list_artifacts' as const
	readonly inputSchema = ListArtifactsInputSchema
	readonly outputSchema = ListArtifactsOutputSchema

	constructor(private readonly artifacts: ArtifactRepository) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const rows = await this.artifacts.listByThread(input.threadId)
		return {
			artifacts: rows
				.filter(a => a.ownerId === input.ownerId)
				.map(a => ({
					artifactId: a.id.value,
					issueId: a.issueId,
					kind: a.kind,
					name: a.name,
					ref: a.ref,
					meta: a.meta,
					recordedAt: a.recordedAt.toISOString(),
				})),
		}
	}
}
