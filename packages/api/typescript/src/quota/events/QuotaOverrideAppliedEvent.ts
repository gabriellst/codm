import { BaseDomainEvent, z } from '@template/core-typescript'
import { QuotaKey } from '@template/contracts-typescript/wire/enums'

export const QuotaOverrideAppliedEventSchema = z.domainEvent({
	ownerId: z.string().min(1),
	meter: z.enum(QuotaKey),
	delta: z.number().int(),
	idempotencyKey: z.string().min(1),
})

export class QuotaOverrideAppliedEvent extends BaseDomainEvent<typeof QuotaOverrideAppliedEventSchema> {
	static override readonly name = 'quota.override.applied' as const
	static readonly schema = QuotaOverrideAppliedEventSchema
}
