import { BaseDomainEvent, z } from '@template/core-typescript'

export const PaymentMethodVaultedEventSchema = z.domainEvent({
	ownerId: z.string().min(1),
	pmRef: z.string().min(1),
})

export class PaymentMethodVaultedEvent extends BaseDomainEvent<typeof PaymentMethodVaultedEventSchema> {
	static override readonly name = 'billing.payment_method.vaulted' as const
	static readonly schema = PaymentMethodVaultedEventSchema
}
