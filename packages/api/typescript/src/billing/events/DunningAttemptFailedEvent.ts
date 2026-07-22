import { BaseDomainEvent } from '@template/core-typescript'
import { z } from '@template/core-typescript'
import { DeclineReason } from '@template/contracts-typescript/wire/enums'

export const DunningAttemptFailedEventSchema = z.domainEvent({
	ownerId: z.string().min(1),
	invoiceId: z.string().min(1),
	attemptNo: z.number().int().positive(),
	remainingAttempts: z.number().int().nonnegative(),
	declineCode: z.enum(DeclineReason).optional(),
	nextRetryAt: z.string().nullable(),
})

export class DunningAttemptFailedEvent extends BaseDomainEvent<typeof DunningAttemptFailedEventSchema> {
	static override readonly name = 'billing.dunning.attempt_failed' as const
	static readonly schema = DunningAttemptFailedEventSchema
}
