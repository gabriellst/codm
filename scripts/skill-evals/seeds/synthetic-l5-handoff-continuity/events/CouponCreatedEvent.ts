import { BaseDomainEvent, z } from '@codm/core-typescript'
import { CouponType } from '../enums'

export const CouponCreatedEventSchema = z.domainEvent({
	couponId: z.uuid(),
	storeId: z.uuid(),
	code: z.string(),
	type: z.enum(CouponType),
	value: z.number().int(),
	expiresAt: z.iso.datetime({ offset: true }).optional(),
})

export class CouponCreatedEvent extends BaseDomainEvent<typeof CouponCreatedEventSchema> {
	static override readonly name = 'sales.coupon.created' as const
	static readonly schema = CouponCreatedEventSchema
}
