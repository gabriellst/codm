import { AggregateRoot, BaseError, Id, z } from '@codm/core-typescript'
import Z from 'zod'
import { CouponStatus, CouponType } from '../enums'
import type { SalesDomainErrors } from '../errors'

/**
 * Store-scoped discount coupon (Sales BC write-side aggregate).
 *
 * Format + cross-field invariants live IN the schema (D3/D4): an invalid
 * code length or a percentage/value mismatch cannot even be constructed.
 * The lifecycle default (status = ACTIVE) is born in create() — NOT a
 * schema .default() — so a stored INACTIVE row rehydrates unchanged (D5).
 * Expiry-in-the-future is a creation-time guard in create() only, so an
 * already-expired row can still rehydrate for history (D6).
 */
export const CouponSchema = z
	.object({
		storeId: z.instance(Id),
		code: z
			.string()
			.trim()
			.toUpperCase()
			.min(1, { error: 'COUPON_CODE_REQUIRED' as SalesDomainErrors })
			.max(64, { error: 'INVALID_COUPON_CODE' as SalesDomainErrors }),
		type: z.enum(CouponType),
		value: z.number().int(),
		status: z.enum(CouponStatus),
		expiresAt: z.date().optional(),
	})
	.refine(
		c => {
			if (c.type === CouponType.PERCENTAGE) return c.value >= 1 && c.value <= 100
			return c.value >= 1
		},
		{ error: 'INVALID_COUPON_VALUE' as SalesDomainErrors },
	)

export type CouponProps = Z.infer<typeof CouponSchema>

export class Coupon extends AggregateRoot<typeof CouponSchema> {
	static override schema = CouponSchema

	static create(data: { storeId: string; code: string; type: CouponType; value: number; expiresAt?: Date | string }): Coupon {
		const expiresAt = data.expiresAt == null ? undefined : data.expiresAt instanceof Date ? data.expiresAt : new Date(data.expiresAt)
		if (expiresAt != null && expiresAt <= new Date()) {
			throw new BaseError<SalesDomainErrors>('COUPON_EXPIRY_IN_PAST')
		}
		return new Coupon({
			storeId: data.storeId,
			code: data.code,
			type: data.type,
			value: data.value,
			status: CouponStatus.ACTIVE,
			expiresAt,
		})
	}

	isExpired(now: Date = new Date()): boolean {
		return this.expiresAt != null && this.expiresAt <= now
	}

	/** Tell-don't-ask: guards INSIDE the method, expiry before status (D7). */
	deactivate(now: Date = new Date()): void {
		if (this.isExpired(now)) {
			throw new BaseError<SalesDomainErrors>('COUPON_EXPIRED')
		}
		if (this.status === CouponStatus.INACTIVE) {
			throw new BaseError<SalesDomainErrors>('COUPON_ALREADY_INACTIVE')
		}
		this.status = CouponStatus.INACTIVE
	}
}

export interface Coupon extends CouponProps {}
