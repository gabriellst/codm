import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { PermissionPosture, StopResolution } from '@codm/contracts-typescript/wire/enums'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { SupervisorRetryOutcome } from '../enums/SupervisorRetryOutcome'
import { isResolutionApplicable } from '../utils/StopResolutions'

export const ApplySupervisorRetryInputSchema = z.object({
	issueId: z.uuid(),
	/** The instant of the resolution — handed in (the core has no clock), so a test never sleeps. */
	now: z.date().optional(),
})
export const ApplySupervisorRetryOutputSchema = z.object({
	outcome: z.enum(SupervisorRetryOutcome),
	/** The stops resolved with `AUTO_RETRY` — empty unless `APPLIED`. */
	stopIds: z.array(z.uuid()),
})

/**
 * THE SUPERVISOR'S RETRY (fase 5, item 3) — the sibling of `ApplyDueQuestionDefaults`: a job of the `agent` decides
 * WHEN (its `NUDGE` / `RESTART_WITH_NOTES` verdict on a stall or a provider error nobody answered), and this use case
 * of the `thread` owns the rule — which stop may be retried, who resolves it, what the resume is.
 *
 * ### What it resolves, and what it refuses
 * The task's open stops whose kind admits `AUTO_RETRY` (`RESOLUTIONS_BY_KIND`: a silent stall and a provider error —
 * never a person's stop), each with `AUTO_RETRY` in AUTO: nobody's grant applies, so the resume never inherits the
 * posture of whoever resolved before. It refuses, resolving nothing:
 *  - `PERSON_STOP` — any open stop whose kind does not admit it (a decision, a question, an approval…): the task is
 *    waiting on someone, and the supervisor never answers for a person;
 *  - `NO_STOP` — nothing to retry: none open, or someone resolved it first. Read INSIDE the transaction, and the
 *    conditional UPDATE of `ThreadRepository.save` is the backstop: the first resolution wins.
 *
 * ### What it leaves — and what it does not
 * The resolution and its fact (`thread.stop_resolved`): the block notice closes by the phase-3 policy, and
 * `ResumeIssueOnStopResolved` queues the resume as a `REMINDER` — the last nudge of the episode, the second nudge's
 * words, never an authorization to publish (`PUBLISH_AUTHORIZED_BY[AUTO_RETRY]`). NO signal line, no channel delivery:
 * unlike the question default, the supervisor writes to nobody (owner, 20/11) — the timeline shows its review.
 */
@injectable()
export class ApplySupervisorRetry extends Handler<typeof ApplySupervisorRetryInputSchema, typeof ApplySupervisorRetryOutputSchema> {
	readonly name = 'apply_supervisor_retry' as const
	readonly inputSchema = ApplySupervisorRetryInputSchema
	readonly outputSchema = ApplySupervisorRetryOutputSchema

	constructor(private readonly threads: ThreadRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const now = input.now ?? new Date()
		return this.withTransaction(tx, async tx => {
			const open = await this.threads.openStopsByIssue(input.issueId, tx)
			if (open.some(stop => !isResolutionApplicable(stop.kind, StopResolution.AUTO_RETRY))) {
				return { outcome: SupervisorRetryOutcome.PERSON_STOP, stopIds: [] }
			}
			const retryable = open.filter(stop => !stop.resolvedAt)
			const [first] = retryable
			if (!first) return { outcome: SupervisorRetryOutcome.NO_STOP, stopIds: [] }

			// One task, one conversation: every stop of the issue lives on the issue's thread.
			const thread = await this.threads.findById(first.threadId, tx)
			if (!thread || thread.deletedAt) return { outcome: SupervisorRetryOutcome.NO_STOP, stopIds: [] }
			for (const stop of retryable) thread.resolveStop(stop, StopResolution.AUTO_RETRY, PermissionPosture.AUTO, { now })
			await this.threads.save(thread, tx)
			await this.domainEventRepository.saveMany(thread.pullDomainEvents(), tx)
			return { outcome: SupervisorRetryOutcome.APPLIED, stopIds: retryable.map(stop => stop.stopId) }
		})
	}
}
