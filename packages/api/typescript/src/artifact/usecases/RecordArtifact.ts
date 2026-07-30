import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { ArtifactKind } from '@codm/contracts-typescript/wire/enums'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { IssueRepository } from '@issue/repositories/IssueRepository'
import { Artifact } from '../entities/Artifact'
import { ArtifactRepository } from '../repositories/ArtifactRepository'
import { ArtifactRecordedEvent } from '../events'
import type { ApplicationErrors } from '../errors'

export const RecordArtifactInputSchema = z.object({
	ownerId: z.uuid(),
	threadId: z.uuid(),
	issueId: z.uuid().optional(),
	kind: z.enum(ArtifactKind),
	name: z.string().trim().min(1).max(200),
	ref: z.string().trim().min(1).max(2048),
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
		private readonly threads: ThreadRepository,
		private readonly issues: IssueRepository,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		// Cross-context existence checks ride the owning contexts' REPOSITORIES (the declared read
		// seam) — never raw table selects from a foreign schema.
		const thread = await this.threads.findById(input.threadId)
		if (!thread) throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${input.threadId}`)
		if (input.issueId) {
			const issue = await this.issues.findById(input.issueId)
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
