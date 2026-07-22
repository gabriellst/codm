import { BaseDomainEvent, z } from '@codedm/core-typescript'

export const CouponDeactivatedEventSchema = z.domainEvent({
	couponId: z.uuid(),
	storeId: z.uuid(),
	code: z.string(),
})

export class CouponDeactivatedEvent extends BaseDomainEvent<typeof CouponDeactivatedEventSchema> {
	static override readonly name = 'sales.coupon.deactivated' as const
	static readonly schema = CouponDeactivatedEventSchema
}
