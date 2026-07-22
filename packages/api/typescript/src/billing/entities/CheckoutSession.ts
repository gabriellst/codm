import { AggregateRoot, BaseError, Id, z } from '@template/core-typescript'
import Z from 'zod'

import type { DomainErrors } from '../errors'
import { BillingPlatform, CheckoutIntent, CheckoutSessionStatus } from '@template/contracts-typescript/wire/enums'

// Local object for a hosted-checkout session minted at a gateway (Charge mold) — the accelerator
// this aggregate exists for: without it there is nothing to poll, alarm on, or alert about when a
// checkout webhook is lost. `sessionRef` is the NATURAL key — the gateway's own session/order id
// (Stripe `cs_...`) — and is also the key the `CHECKOUT_VAULT` idempotency claim already uses on
// the real webhook, which is what makes synthesizing a completion event against it identity-safe
// rather than fabricated.
const CheckoutSessionSchema = z.object({
	sessionRef: z
		.string()
		.trim()
		.min(1, { error: 'CHECKOUT_SESSION_REF_REQUIRED' as DomainErrors }),
	ownerId: z.instance(Id),
	platform: z.enum(BillingPlatform),
	intent: z.enum(CheckoutIntent),
	// Nullable — a SETUP-intent session (vaulting a card, no charge) has no invoice to attach to.
	engineInvoiceId: z.instance(Id).optional(),
	status: z.enum(CheckoutSessionStatus),
	mintedAt: z.date(),
	// Nullable — not every gateway response carries an expiry (the port's `expiresAt` is optional).
	expiresAt: z.date().optional(),
})

export type CheckoutSessionProps = Z.infer<typeof CheckoutSessionSchema>

// PENDING is the only non-terminal status — a session is minted PENDING and moves exactly once to
// either terminal outcome. Neither terminal status can be re-entered (absorbing transitions).
const VALID_TRANSITIONS: Record<CheckoutSessionStatus, CheckoutSessionStatus[]> = {
	[CheckoutSessionStatus.PENDING]: [CheckoutSessionStatus.COMPLETED, CheckoutSessionStatus.EXPIRED],
	[CheckoutSessionStatus.COMPLETED]: [],
	[CheckoutSessionStatus.EXPIRED]: [],
}

export class CheckoutSession extends AggregateRoot<typeof CheckoutSessionSchema> {
	static override schema = CheckoutSessionSchema

	static create(data: {
		sessionRef: string
		ownerId: string
		platform: BillingPlatform
		intent: CheckoutIntent
		engineInvoiceId?: string
		mintedAt?: Date
		expiresAt?: Date
	}): CheckoutSession {
		return new CheckoutSession({
			sessionRef: data.sessionRef,
			ownerId: data.ownerId,
			platform: data.platform,
			intent: data.intent,
			engineInvoiceId: data.engineInvoiceId,
			status: CheckoutSessionStatus.PENDING,
			mintedAt: data.mintedAt ?? new Date(),
			expiresAt: data.expiresAt,
		})
	}

	/**
	 * The real webhook (or a reconciler-synthesized event with the same `sessionRef`) confirmed the
	 * session paid/vaulted. Idempotency against double-completion (real + synthetic, either ordering)
	 * is the `CHECKOUT_VAULT` claim's job upstream — this transition itself is only absorbing:
	 * completing an already-COMPLETED or already-EXPIRED session throws.
	 */
	complete(): void {
		this.transitionTo(CheckoutSessionStatus.COMPLETED)
	}

	/**
	 * The gateway reported the session lapsed (or, when unpollable, its own `expiresAt` passed) —
	 * terminal, absorbing, no further reconciliation attempted.
	 */
	expire(): void {
		this.transitionTo(CheckoutSessionStatus.EXPIRED)
	}

	private transitionTo(next: CheckoutSessionStatus): void {
		const allowed = VALID_TRANSITIONS[this.status]
		if (!allowed.includes(next)) {
			throw new BaseError<DomainErrors>('INVALID_CHECKOUT_SESSION_TRANSITION')
		}
		this.status = next
		this.validate()
	}
}

// Declaration merging — interface BELOW class
export interface CheckoutSession extends CheckoutSessionProps {}
