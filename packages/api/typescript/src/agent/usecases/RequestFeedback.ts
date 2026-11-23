import { injectable } from 'tsyringe-neo'
import { BaseError, Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { IssueSignalLevel } from '@codm/contracts-typescript/wire/enums'
import { IssueHold } from '@issue/services/IssueHold'
import { ArtifactRepository } from '@artifact/repositories/ArtifactRepository'
import { ArtifactSendability } from '@artifact/services/ArtifactSendability'
import { IssueSpokeEvent } from '../events/IssueSpokeEvent'
import type { ApplicationErrors } from '../errors'

/** The longest text a FEEDBACK / PROGRESS signal carries (fase 3). */
export const ISSUE_SIGNAL_TEXT_MAX = 2000
/** The most artifacts one feedback may cite — the main preview goes to the group, the rest to the panel. */
export const FEEDBACK_ARTIFACTS_MAX = 20

export const RequestFeedbackInputSchema = z.object({
	ownerId: z.uuid(),
	threadId: z.uuid(),
	issueId: z.uuid(),
	/**
	 * The issue whose RUN is calling, read off the run identity by the controller — absent for the console.
	 * A held issue's run is refused (ISSUE_PAUSED, `IssueHold`). Never part of the tool's arguments.
	 */
	actingIssueId: z.uuid().optional(),
	text: z.string().trim().min(1).max(ISSUE_SIGNAL_TEXT_MAX),
	/** The preview sent to the group — an artifact this issue recorded. */
	mainArtifactId: z.uuid(),
	/** Every artifact the feedback cites (the main one is added when missing); the others stay on the panel. */
	artifactIds: z.array(z.uuid()).max(FEEDBACK_ARTIFACTS_MAX),
})
export const RequestFeedbackOutputSchema = z.void()

/**
 * The issue shows the group a preview to look at (fase 3, item 1) — a FEEDBACK signal: the main artifact
 * reaches the group (when the group's mode sends feedback there), the others the panel. NOT a stop: it
 * does not hold the issue, and nobody has to answer it.
 *
 * ### Every refusal is synchronous
 * What `SendArtifact` checks before it enqueues anything is checked HERE, before the fact is saved
 * (`ArtifactSendability` — one set of checks for both doors): the main artifact exists, is THIS issue's,
 * still has its file, fits its kind's ceiling and the channel takes media. The delivery happens later, by
 * the output policy, where a refusal would be a retried and dead-lettered command the session never hears
 * of — here it is an error the session can act on (record the file again, pick another).
 */
@injectable()
export class RequestFeedback extends Handler<typeof RequestFeedbackInputSchema, typeof RequestFeedbackOutputSchema> {
	readonly name = 'request_feedback' as const
	readonly inputSchema = RequestFeedbackInputSchema
	readonly outputSchema = RequestFeedbackOutputSchema

	constructor(
		private readonly hold: IssueHold,
		private readonly artifacts: ArtifactRepository,
		private readonly sendability: ArtifactSendability,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		await this.hold.assertNotHeld(input.actingIssueId)

		// The main artifact is cited too — whether or not the caller listed it — and each id once.
		const artifactIds = [...new Set([input.mainArtifactId, ...input.artifactIds])]
		for (const artifactId of artifactIds) {
			const artifact = await this.artifacts.findById(artifactId)
			// Another owner's, another conversation's or another issue's artifact is not this feedback's to
			// cite — one answer for all of them, the same one `SendArtifact` gives.
			if (!artifact || artifact.ownerId !== input.ownerId || artifact.threadId !== input.threadId || artifact.issueId !== input.issueId)
				throw new BaseError<ApplicationErrors>('ARTIFACT_NOT_FOUND', `no artifact ${artifactId} recorded by issue ${input.issueId}`)
			if (artifactId === input.mainArtifactId) await this.sendability.check({ id: artifactId, kind: artifact.kind, ref: artifact.ref })
		}

		await this.withTransaction(tx, async tx => {
			await this.domainEventRepository.save(
				new IssueSpokeEvent({
					entityId: input.issueId,
					ownerId: input.ownerId,
					payload: {
						issueId: input.issueId,
						threadId: input.threadId,
						level: IssueSignalLevel.FEEDBACK,
						text: input.text,
						artifactIds,
						mainArtifactId: input.mainArtifactId,
					},
				}),
				tx,
			)
		})
	}
}
