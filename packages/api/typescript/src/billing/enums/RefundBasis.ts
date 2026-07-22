/**
 * The legal/policy basis a refundable amount was computed on (RefundPolicy.refundableFor). Shared by
 * the policy service AND the RequestRefund controller output so the two can't drift.
 *  - CDC_WINDOW: full refund within the consumer-protection withdrawal window (BR: CDC art. 49).
 *  - PRO_RATA:   past the window, only the unused slice of the billing period is refundable.
 *  - NONE:       nothing refundable (no settled charge, or nothing left uncredited).
 */
export enum RefundBasis {
	CDC_WINDOW = 'CDC_WINDOW',
	PRO_RATA = 'PRO_RATA',
	NONE = 'NONE',
}
