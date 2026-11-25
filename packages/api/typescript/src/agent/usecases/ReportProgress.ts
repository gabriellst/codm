import { injectable } from 'tsyringe-neo'
import { BaseError, Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { IssueSignalLevel } from '@codm/contracts-typescript/wire/enums'
import { ArtifactRepository } from '@artifact/repositories/ArtifactRepository'
import { IssueHold } from '@issue/services/IssueHold'
import { IssueSpokeEvent } from '../events/IssueSpokeEvent'
import { FEEDBACK_ARTIFACTS_MAX, ISSUE_SIGNAL_TEXT_MAX } from './RequestFeedback'
import type { ApplicationErrors } from '../errors'

export const ReportProgressInputSchema = z.object({
	ownerId: z.uuid(),
	threadId: z.uuid(),
	issueId: z.uuid(),
	/**
	 * The issue whose RUN is calling, read off the run identity by the controller — absent for the console.
	 * A held issue's run is refused (ISSUE_PAUSED, `IssueHold`). Never part of the tool's arguments.
	 */
	actingIssueId: z.uuid().optional(),
	text: z.string().trim().min(1).max(ISSUE_SIGNAL_TEXT_MAX),
	/**
	 * The prints that SHOW this step (voz do grupo, 25/11) — each recorded by this issue. They go to the group even
	 * when the text stays on the panel (`ARTIFACTS_TO_GROUP`): the group asked to see the work again.
	 */
	artifactIds: z.array(z.uuid()).max(FEEDBACK_ARTIFACTS_MAX).optional(),
})
export const ReportProgressOutputSchema = z.void()

/**
 * The issue records what it did (fase 3, item 1) — a PROGRESS signal: the task's timeline and panel, and
 * the group only when it chose the EVERYTHING mode (the output policy decides, not this door). The prints it
 * cites go to the group in the default mode too (`ARTIFACTS_TO_GROUP`, voz do grupo 25/11).
 */
@injectable()
export class ReportProgress extends Handler<typeof ReportProgressInputSchema, typeof ReportProgressOutputSchema> {
	readonly name = 'report_progress' as const
	readonly inputSchema = ReportProgressInputSchema
	readonly outputSchema = ReportProgressOutputSchema

	constructor(
		private readonly hold: IssueHold,
		private readonly artifacts: ArtifactRepository,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		await this.hold.assertNotHeld(input.actingIssueId)
		const artifactIds = [...new Set(input.artifactIds ?? [])]
		for (const artifactId of artifactIds) {
			const artifact = await this.artifacts.findById(artifactId)
			// The same answer `RequestFeedback` gives: only THIS issue's artifacts are its to show.
			if (!artifact || artifact.ownerId !== input.ownerId || artifact.threadId !== input.threadId || artifact.issueId !== input.issueId)
				throw new BaseError<ApplicationErrors>('ARTIFACT_NOT_FOUND', `no artifact ${artifactId} recorded by issue ${input.issueId}`)
		}
		await this.withTransaction(tx, async tx => {
			await this.domainEventRepository.save(
				new IssueSpokeEvent({
					entityId: input.issueId,
					ownerId: input.ownerId,
					payload: {
						issueId: input.issueId,
						threadId: input.threadId,
						level: IssueSignalLevel.PROGRESS,
						text: input.text,
						artifactIds,
					},
				}),
				tx,
			)
		})
	}
}
