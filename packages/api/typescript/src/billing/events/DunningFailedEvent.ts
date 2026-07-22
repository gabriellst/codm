import { BaseDomainEvent } from '@template/core-typescript'
import { z } from '@template/core-typescript'
import { DeclineReason } from '@template/contracts-typescript/wire/enums'

export const DunningFailedEventSchema = z.domainEvent({
	ownerId: z.string().min(1),
	invoiceId: z.string().min(1),
	totalAttempts: z.number().int().nonnegative(),
	finalDeclineCode: z.enum(DeclineReason).optional(),
})

export class DunningFailedEvent extends BaseDomainEvent<typeof DunningFailedEventSchema> {
	static override readonly name = 'billing.dunning.failed' as const
	static readonly schema = DunningFailedEventSchema
}
