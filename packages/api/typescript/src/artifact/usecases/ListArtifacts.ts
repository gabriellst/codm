import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@codedm/core-typescript'
import { ArtifactKind } from '@codedm/contracts-typescript/wire/enums'
import { ArtifactRepository } from '../repositories/ArtifactRepository'

export const ListArtifactsInputSchema = z.object({ ownerId: z.uuid(), threadId: z.uuid() })
export const ListArtifactsOutputSchema = z.object({
	artifacts: z.array(
		z.object({
			artifactId: z.uuid(),
			issueId: z.uuid().optional(),
			kind: z.enum(ArtifactKind),
			name: z.string(),
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
					meta: a.meta,
					recordedAt: a.recordedAt.toISOString(),
				})),
		}
	}
}
