import { BaseDomainEvent } from '@template/core-typescript'
import { z } from '@template/core-typescript'

import { DeclineClass } from '@billing/services/DeclineClassifier'
import { DeclineReason, PlanName } from '@template/contracts-typescript/wire/enums'

export const DunningStartedEventSchema = z.domainEvent({
	ownerId: z.string().min(1),
	invoiceId: z.string().min(1),
	planName: z.enum(PlanName),
	amountCents: z.number().int().nonnegative(),
	declineCode: z.enum(DeclineReason).optional(),
	classification: z.enum(DeclineClass),
	attemptNo: z.number().int().nonnegative(),
	maxAttempts: z.number().int().positive(),
	nextRetryAt: z.string().nullable(), // ISO; null quando hard/sem retry
})

export class DunningStartedEvent extends BaseDomainEvent<typeof DunningStartedEventSchema> {
	static override readonly name = 'billing.dunning.started' as const
	static readonly schema = DunningStartedEventSchema
}
