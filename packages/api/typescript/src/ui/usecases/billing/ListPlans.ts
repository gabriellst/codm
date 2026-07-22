import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { MoneySchema } from '@shared/objects'

import { PlanRegistry } from '@billing/objects'
import type { Entitlement } from '@quota/services'
import { PlanName, QuotaKey } from '@template/contracts-typescript/wire/enums'

// The API view of a plan (drops the internal engine `planCode`). Every quota dimension the plan
// carries is exposed as a map keyed by the shared QuotaKey — the catalog is never pinned to a
// fixed set of dimensions.
export const PlanViewSchema = z.object({
	name: z.enum(PlanName),
	basePrice: MoneySchema,
	quotas: z.record(
		z.enum(QuotaKey),
		z.object({
			limit: z.number().int().nonnegative().nullable(),
			metered: z.boolean(),
		}),
	),
})

export const ListPlansInputSchema = z.object({})
export const ListPlansOutputSchema = z.object({
	plans: z.array(PlanViewSchema),
})

@injectable()
export class ListPlans extends Handler<typeof ListPlansInputSchema, typeof ListPlansOutputSchema> {
	readonly name = 'list_plans' as const
	readonly inputSchema = ListPlansInputSchema
	readonly outputSchema = ListPlansOutputSchema

	protected async handle(_input: this['input'], _tx?: Transaction): Promise<this['output']> {
		return {
			plans: PlanRegistry.names().map(name => ({
				name,
				// `basePrice` is a FLAT { amountCents, currency } (MoneySchema), not a Money VO — surfaced verbatim.
				basePrice: PlanRegistry.get(name).basePrice,
				quotas: Object.fromEntries(
					PlanRegistry.quotaKeys(name).map(key => {
						const policy = PlanRegistry.policy(name, key)!
						return [key, { limit: policy.limit, metered: policy.overage !== undefined }]
					}),
				) as Entitlement,
			})),
		}
	}
}
