import { AggregateRoot, BaseError, Id, z } from '@template/core-typescript'
import Z from 'zod'
import { Money } from '@shared/objects'
import { CurrencyCode } from '@template/contracts-typescript/wire/enums'

import type { DomainErrors } from '../errors'
import { BillingPlatform, ChargeStatus, DeclineReason, PaymentMethodType } from '@template/contracts-typescript/wire/enums'

// Thin aggregate — a single MIT attempt against an invoice. The authoritative
// paid/failed outcome arrives later via the gateway webhook; this just records
// the attempt + its synchronous result.
const ChargeSchema = z.object({
	ownerId: z.instance(Id),
	invoiceId: z.instance(Id),
	platform: z.enum(BillingPlatform),
	method: z.enum(PaymentMethodType),
	amountCents: z.number().int().nonnegative(),
	attemptNo: z.number().int().nonnegative(),
	status: z.enum(ChargeStatus),
	gatewayTxId: z.string().optional(),
	// Decline reason of this charge's LAST attempt (FAILED only). Feeds the
	// DeclineClassifier/DunningRetryPolicy straight from the ledger, without hunting the event log.
	declineCode: z.enum(DeclineReason).optional(),
})

export type ChargeProps = Z.infer<typeof ChargeSchema>

// PENDING is the only non-terminal status — a Charge is created PENDING and moves
// exactly once to either terminal outcome. Neither terminal status can be re-entered
// or reversed here (a refund is modeled on the Invoice, not a Charge transition).
const VALID_TRANSITIONS: Record<ChargeStatus, ChargeStatus[]> = {
	[ChargeStatus.PENDING]: [ChargeStatus.SUCCEEDED, ChargeStatus.FAILED],
	[ChargeStatus.SUCCEEDED]: [],
	[ChargeStatus.FAILED]: [],
}

export class Charge extends AggregateRoot<typeof ChargeSchema> {
	static override schema = ChargeSchema

	static create(data: {
		ownerId: string
		invoiceId: string
		platform: BillingPlatform
		method: PaymentMethodType
		amountCents: number
		attemptNo: number
	}): Charge {
		return new Charge({
			ownerId: data.ownerId,
			invoiceId: data.invoiceId,
			platform: data.platform,
			method: data.method,
			amountCents: data.amountCents,
			attemptNo: data.attemptNo,
			status: ChargeStatus.PENDING,
		})
	}

	/**
	 * The charge amount as a Money VO. `billing_charges` stores only integer
	 * cents (no currency column) — the ledger is BRL-only today, so this
	 * defaults to CurrencyCode.BRL. `amountCents` remains the persisted/schema
	 * field; this is a derived, in-memory accessor over it.
	 */
	get amount(): Money {
		return new Money({ amountCents: this.amountCents, currency: CurrencyCode.BRL })
	}

	markSucceeded(gatewayTxId: string): void {
		this.gatewayTxId = gatewayTxId
		this.transitionTo(ChargeStatus.SUCCEEDED)
	}

	markFailed(declineCode?: DeclineReason): void {
		if (declineCode) this.declineCode = declineCode
		this.transitionTo(ChargeStatus.FAILED)
	}

	private transitionTo(next: ChargeStatus): void {
		const allowed = VALID_TRANSITIONS[this.status]
		if (!allowed.includes(next)) {
			throw new BaseError<DomainErrors>('INVALID_CHARGE_TRANSITION')
		}
		this.status = next
		this.validate()
	}
}

// Declaration merging — interface BELOW class
export interface Charge extends ChargeProps {}
