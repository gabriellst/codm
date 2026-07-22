import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@template/core-typescript'

import { QuotaEntitlement, QuotaUsageSource } from '@quota/services'
import { QuotaKey } from '@template/contracts-typescript/wire/enums'

export const GetUsageInputSchema = z.object({
	ownerId: z.string().min(1),
})

export const GetUsageOutputSchema = z.object({
	quotas: z.array(
		z.object({
			key: z.enum(QuotaKey),
			used: z.number(),
			// `null` means unlimited (matches QuotaEntitlement's `limit`). Kept as the JSON key `included`
			// (not `limit`) so the existing FE (UsageSection/QuotaBar) reads it unchanged.
			included: z.number().nullable(),
		}),
	),
})

// This usecase resolves usage internally (no caller-supplied counts) — every key is read the same
// generic way via QuotaUsageSource, keyed by the owner's effective entitlement.
@injectable()
export class GetUsage extends Handler<typeof GetUsageInputSchema, typeof GetUsageOutputSchema> {
	readonly name = 'get_usage' as const
	readonly inputSchema = GetUsageInputSchema
	readonly outputSchema = GetUsageOutputSchema

	constructor(
		private entitlement: QuotaEntitlement,
		private usageSource: QuotaUsageSource,
	) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const { ownerId } = input

		const ent = await this.entitlement.entitlementFor(ownerId)
		const keys = Object.keys(ent) as QuotaKey[]

		const quotas = await Promise.all(
			keys.map(async key => ({
				key,
				used: await this.usageSource.usage(ownerId, key),
				included: ent[key].limit,
			})),
		)

		return { quotas }
	}
}
