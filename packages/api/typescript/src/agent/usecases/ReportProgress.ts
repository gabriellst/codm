import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { IssueSignalLevel } from '@codm/contracts-typescript/wire/enums'
import { IssueHold } from '@issue/services/IssueHold'
import { IssueSpokeEvent } from '../events/IssueSpokeEvent'
import { ISSUE_SIGNAL_TEXT_MAX } from './RequestFeedback'

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
})
export const ReportProgressOutputSchema = z.void()

/**
 * The issue records what it did (fase 3, item 1) — a PROGRESS signal: the task's timeline and panel, and
 * the group only when it chose the EVERYTHING mode (the output policy decides, not this door).
 */
@injectable()
export class ReportProgress extends Handler<typeof ReportProgressInputSchema, typeof ReportProgressOutputSchema> {
	readonly name = 'report_progress' as const
	readonly inputSchema = ReportProgressInputSchema
	readonly outputSchema = ReportProgressOutputSchema

	constructor(private readonly hold: IssueHold) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		await this.hold.assertNotHeld(input.actingIssueId)
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
						artifactIds: [],
					},
				}),
				tx,
			)
		})
	}
}
