import { BaseDomainEvent } from '@template/core-typescript'
import { z } from '@template/core-typescript'
import { RecoveredVia } from '@billing/enums/RecoveredVia'

export const DunningSucceededEventSchema = z.domainEvent({
	ownerId: z.string().min(1),
	invoiceId: z.string().min(1),
	totalAttempts: z.number().int().positive(),
	recoveredVia: z.enum(RecoveredVia),
})

export class DunningSucceededEvent extends BaseDomainEvent<typeof DunningSucceededEventSchema> {
	static override readonly name = 'billing.dunning.succeeded' as const
	static readonly schema = DunningSucceededEventSchema
}
