import { AggregateRoot, BaseError, z } from '@template/core-typescript'
import Z from 'zod'

import { Mandate, type MandateProps } from '../objects/Mandate'
import { PaymentInstrumentSchema, type PaymentInstrument } from '../objects/PaymentInstrument'
import type { DomainErrors } from '../errors'
import { BillingPlatform, PaymentMethodStatus } from '@template/contracts-typescript/wire/enums'

const PaymentMethodSchema = z.object({
	ownerId: z.string().min(1, { error: 'PAYMENT_METHOD_OWNER_ID_REQUIRED' as DomainErrors }),
	platform: z.enum(BillingPlatform),
	mandate: z.instance(Mandate),
	status: z.enum(PaymentMethodStatus),
	// Wallet model: many stored instruments, exactly one default per owner (renewals charge it).
	isDefault: z.boolean(),
	instrument: PaymentInstrumentSchema,
})

export type PaymentMethodProps = Z.infer<typeof PaymentMethodSchema>

// A vaulted payment method only ever moves forward — ACTIVE can lapse (EXPIRED) or be
// detached from the owner (REMOVED); EXPIRED can still be REMOVED (cleanup); REMOVED is
// terminal. There is no transition back to ACTIVE — reactivation means vaulting a new one.
const VALID_TRANSITIONS: Record<PaymentMethodStatus, PaymentMethodStatus[]> = {
	[PaymentMethodStatus.ACTIVE]: [PaymentMethodStatus.EXPIRED, PaymentMethodStatus.REMOVED],
	[PaymentMethodStatus.EXPIRED]: [PaymentMethodStatus.REMOVED],
	[PaymentMethodStatus.REMOVED]: [],
}

export class PaymentMethod extends AggregateRoot<typeof PaymentMethodSchema> {
	static override schema = PaymentMethodSchema

	static create(data: {
		ownerId: string
		platform: BillingPlatform
		instrument: PaymentInstrument
		mandate: MandateProps | Mandate
		isDefault?: boolean
	}): PaymentMethod {
		return new PaymentMethod({
			ownerId: data.ownerId,
			platform: data.platform,
			mandate: data.mandate instanceof Mandate ? data.mandate : new Mandate(data.mandate),
			status: PaymentMethodStatus.ACTIVE,
			// Both vault paths (webhook CIT vault, UpdatePaymentMethod) make the new card the default.
			isDefault: data.isDefault ?? true,
			instrument: data.instrument,
		})
	}

	makeDefault(): void {
		this.isDefault = true
		this.validate()
	}

	demoteDefault(): void {
		this.isDefault = false
		this.validate()
	}

	expire(): void {
		this.transitionTo(PaymentMethodStatus.EXPIRED)
	}

	/**
	 * Removal decides its own wallet invariants (Tell Don't Ask) — the caller supplies the one
	 * fact the entity can't see (how many OTHER active methods the wallet holds):
	 * the wallet may never empty out (renewals charge it), and the default demands an explicit
	 * hand-off before leaving.
	 */
	remove(wallet: { otherActiveCount: number }): void {
		if (wallet.otherActiveCount <= 0) {
			throw new BaseError<DomainErrors>('PAYMENT_METHOD_LAST_ACTIVE', 'Cannot remove the last active payment method')
		}
		if (this.isDefault) {
			throw new BaseError<DomainErrors>('PAYMENT_METHOD_IS_DEFAULT', 'Set another default payment method first')
		}
		this.transitionTo(PaymentMethodStatus.REMOVED)
	}

	private transitionTo(next: PaymentMethodStatus): void {
		const allowed = VALID_TRANSITIONS[this.status]
		if (!allowed.includes(next)) {
			throw new BaseError<DomainErrors>('INVALID_PAYMENT_METHOD_TRANSITION')
		}
		this.status = next
		this.validate()
	}
}

// Declaration merging — interface BELOW class
export interface PaymentMethod extends PaymentMethodProps {}
