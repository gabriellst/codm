import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { StopKind } from '@codedm/contracts-typescript/wire/enums'
import { IssueRepository } from '@issue/repositories/IssueRepository'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { StopPolicyConfigRepository, type StopPolicy } from '../repositories/StopPolicyConfigRepository'
import type { ApplicationErrors } from '../errors'

export const RaiseStopInputSchema = z.object({
	stopId: z.uuid(),
	threadId: z.uuid(),
	/**
	 * OPTIONAL since B4 (spec decision 4) — and this single character is the feature. A stop with no
	 * issue is the orchestrator's needs-approval, raised before any issue exists; while this key was
	 * required the case was unreachable no matter what the aggregate allowed.
	 */
	issueId: z.uuid().optional(),
	kind: z.enum(StopKind),
	title: z.string(),
	detail: z.string(),
})

export const RaiseStopOutputSchema = z.object({ stopId: z.uuid() })

const POLICY_KEY: Record<StopKind, keyof StopPolicy> = {
	[StopKind.SERVER_ERROR]: 'serverErrors',
	[StopKind.BLOCKED_BY_CLASSIFICATION]: 'blockedByClassification',
	[StopKind.HUMAN_REQUESTED]: 'humanRequested',
	[StopKind.APPROVAL_NEEDED]: 'approvalNeeded',
	[StopKind.AUTH_REQUIRED]: 'authRequired',
}

/**
 * C24 RaiseStop — records a Stop for the Needs-You panel, but ONLY when the criterion is enabled in
 * StopPolicyConfig (`STOP_CRITERION_DISABLED` otherwise). Driven by the terminal's stop fact via
 * `RecordStopFromExecution`; that handler swallows the disabled/archived cases as a no-op.
 *
 * ### Why this lives in `thread/` since B4
 * The Stop is a child of the `Thread` aggregate (spec decision 4), so this use case loads a `Thread`,
 * calls a method on it and saves it. `docs/BACKEND.md:170` forbids importing another context's entities
 * and `:173` restricts changing another context's state to integration events — a version of this use
 * case sitting in `issue/` would break both. It reads `IssueRepository` for the archived guard, which is
 * the sanctioned cross-context shape (a repository READ, `docs/BACKEND.md:412`).
 *
 * ### `ownerId` comes from the THREAD
 * It used to come from `issue.ownerId`, which is exactly what made a stop without an issue impossible to
 * scope. The thread always exists and always knows its owner.
 */
@injectable()
export class RaiseStop extends Handler<typeof RaiseStopInputSchema, typeof RaiseStopOutputSchema> {
	readonly name = 'raise_stop' as const
	readonly inputSchema = RaiseStopInputSchema
	readonly outputSchema = RaiseStopOutputSchema

	constructor(
		private readonly threads: ThreadRepository,
		private readonly issues: IssueRepository,
		private readonly policy: StopPolicyConfigRepository,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		// IDEMPOTENT, and it is a NAMED tightening (see the Scope fence). `stopId` is decided upstream and
		// the fact that drives this is at-least-once, so a redelivery arrives with the SAME id — which used
		// to hit the primary key of `issue_stops` and THROW. The handler above only swallows three named
		// codes, so the outbox retried a constraint violation five times and dead-lettered the needs-you
		// signal: the operator never saw the card. Early return is the shape `OpenIssue` already uses for
		// exactly this ("returns early when it already exists"), and it is what makes the docstring's
		// promise — the sanctioned outcomes are a no-op, "not surfaced" — actually true.
		const existing = await this.threads.findStop(input.stopId)
		if (existing) return { stopId: existing.stopId }

		const thread = await this.threads.findById(input.threadId)
		if (!thread) throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${input.threadId}`)

		// The archived guard applies only when there IS an issue. A thread-level stop has no issue to be
		// archived, and demanding one back would re-close the hole decision 4 opens.
		if (input.issueId) {
			const issue = await this.issues.findById(input.issueId)
			if (!issue) throw new BaseError<ApplicationErrors>('ISSUE_NOT_FOUND', `no issue ${input.issueId}`)
			if (issue.archived) throw new BaseError<ApplicationErrors>('ISSUE_ARCHIVED', `issue ${input.issueId} is archived`)
		}

		const policy = await this.policy.get(thread.ownerId)
		if (!policy[POLICY_KEY[input.kind]]) {
			throw new BaseError<ApplicationErrors>('STOP_CRITERION_DISABLED', `the ${input.kind} criterion is disabled`)
		}

		return this.withTransaction(tx, async tx => {
			const stop = thread.raiseStop({
				stopId: input.stopId,
				issueId: input.issueId,
				kind: input.kind,
				title: input.title,
				detail: input.detail,
			})
			await this.threads.save(thread, tx)
			return { stopId: stop.stopId }
		})
	}
}
