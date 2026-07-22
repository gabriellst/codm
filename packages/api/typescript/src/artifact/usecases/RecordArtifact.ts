import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { Handler, z, BaseError, DrizzleClient } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { ArtifactKind } from '@template/contracts-typescript/wire/enums'
import { threads, issues } from '@template/contracts/db'
import { Artifact } from '../entities/Artifact'
import { ArtifactRepository } from '../repositories/ArtifactRepository'
import { ArtifactRecordedEvent } from '../events'
import type { ApplicationErrors } from '../errors'

export const RecordArtifactInputSchema = z.object({
	ownerId: z.uuid(),
	threadId: z.uuid(),
	issueId: z.uuid().optional(),
	kind: z.enum(ArtifactKind),
	name: z.string().trim().min(1),
	ref: z.string().trim().min(1),
	meta: z.string(),
})

export const RecordArtifactOutputSchema = z.object({ artifactId: z.uuid() })

/**
 * C30 RecordArtifact — stores a non-code output (image / file / link) and publishes `artifact.recorded`
 * (→ `integration.artifact.recorded`). Validates the thread (and issue, when given) exist via table
 * reads — the artifact catalog is a sink, not the owner of those aggregates.
 */
@injectable()
export class RecordArtifact extends Handler<typeof RecordArtifactInputSchema, typeof RecordArtifactOutputSchema> {
	readonly name = 'record_artifact' as const
	readonly inputSchema = RecordArtifactInputSchema
	readonly outputSchema = RecordArtifactOutputSchema

	constructor(
		private readonly artifacts: ArtifactRepository,
		private readonly db: DrizzleClient,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const [thread] = await this.db.select({ id: threads.id }).from(threads).where(eq(threads.id, input.threadId)).limit(1)
		if (!thread) throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${input.threadId}`)
		if (input.issueId) {
			const [issue] = await this.db.select({ id: issues.id }).from(issues).where(eq(issues.id, input.issueId)).limit(1)
			if (!issue) throw new BaseError<ApplicationErrors>('ISSUE_NOT_FOUND', `no issue ${input.issueId}`)
		}

		return this.withTransaction(tx, async tx => {
			const artifact = Artifact.create({
				ownerId: input.ownerId,
				threadId: input.threadId,
				issueId: input.issueId,
				kind: input.kind,
				name: input.name,
				ref: input.ref,
				meta: input.meta,
			})
			await this.artifacts.save(artifact, tx)
			await this.domainEventRepository.save(
				new ArtifactRecordedEvent({
					entityId: artifact.id.value,
					ownerId: input.ownerId,
					payload: { artifactId: artifact.id.value, threadId: input.threadId, issueId: input.issueId, kind: input.kind, name: input.name },
				}),
				tx,
			)
			return { artifactId: artifact.id.value }
		})
	}
}
