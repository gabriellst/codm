import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { StopKind } from '@codedm/contracts-typescript/wire/enums'
import { IssueRepository } from '../repositories/IssueRepository'
import { StopRepository } from '../repositories/StopRepository'
import { StopPolicyConfigRepository, type StopPolicy } from '../repositories/StopPolicyConfigRepository'
import type { ApplicationErrors } from '../errors'

export const RaiseStopInputSchema = z.object({
	stopId: z.uuid(),
	issueId: z.uuid(),
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
}

/**
 * C24 RaiseStop — records a Stop for the Needs-You panel, but ONLY when the criterion is enabled in
 * StopPolicyConfig (`STOP_CRITERION_DISABLED` otherwise). Driven by the terminal's
 * `integration.issue.stop_raised`; the handler swallows the disabled/archived cases as a no-op.
 */
@injectable()
export class RaiseStop extends Handler<typeof RaiseStopInputSchema, typeof RaiseStopOutputSchema> {
	readonly name = 'raise_stop' as const
	readonly inputSchema = RaiseStopInputSchema
	readonly outputSchema = RaiseStopOutputSchema

	constructor(
		private readonly issues: IssueRepository,
		private readonly stops: StopRepository,
		private readonly policy: StopPolicyConfigRepository,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const issue = await this.issues.findById(input.issueId)
		if (!issue) throw new BaseError<ApplicationErrors>('ISSUE_NOT_FOUND', `no issue ${input.issueId}`)
		issue.assertNotArchived()

		const policy = await this.policy.get(issue.ownerId)
		if (!policy[POLICY_KEY[input.kind]]) {
			throw new BaseError<ApplicationErrors>('STOP_CRITERION_DISABLED', `the ${input.kind} criterion is disabled`)
		}

		return this.withTransaction(tx, async tx => {
			const stop = await this.stops.raise(
				{
					stopId: input.stopId,
					ownerId: issue.ownerId,
					issueId: issue.id.value,
					threadId: issue.threadId,
					kind: input.kind,
					title: input.title,
					detail: input.detail,
				},
				tx,
			)
			return { stopId: stop.stopId }
		})
	}
}
