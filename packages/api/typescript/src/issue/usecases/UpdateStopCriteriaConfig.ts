import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { StopPolicyConfigRepository } from '../repositories/StopPolicyConfigRepository'

export const UpdateStopCriteriaConfigInputSchema = z.object({
	ownerId: z.uuid(),
	stopCriteria: z.object({
		serverErrors: z.boolean(),
		blockedByClassification: z.boolean(),
		humanRequested: z.boolean(),
		approvalNeeded: z.boolean(),
	}),
})
export const UpdateStopCriteriaConfigOutputSchema = z.void()

/** C29 UpdateStopCriteriaConfig — global (per-owner) toggles for which stop criteria are active. */
@injectable()
export class UpdateStopCriteriaConfig extends Handler<
	typeof UpdateStopCriteriaConfigInputSchema,
	typeof UpdateStopCriteriaConfigOutputSchema
> {
	readonly name = 'update_stop_criteria_config' as const
	readonly inputSchema = UpdateStopCriteriaConfigInputSchema
	readonly outputSchema = UpdateStopCriteriaConfigOutputSchema

	constructor(private readonly policy: StopPolicyConfigRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		await this.withTransaction(tx, async tx => this.policy.upsert(input.ownerId, input.stopCriteria, tx))
	}
}
