import { AggregateRoot, BaseError, Id, z } from '@template/core-typescript'
import Z from 'zod'

import type { DomainErrors } from '../errors'
import { BillingPlatform, DisputeStatus } from '@template/contracts-typescript/wire/enums'

// The PROCESS of a chargeback (open→won|lost) — the money stays on the CHARGEBACK credit note.
// `gatewayDisputeRef` is the natural key: the gateway's real dispute id where it exists (Stripe
// `dp_…`), else the synthetic `evt:{externalId}` key the handler derives from the webhook event —
// unique per (ref, platform) in the database.
const DisputeSchema = z.object({
	gatewayDisputeRef: z
		.string()
		.trim()
		.min(1, { error: 'DISPUTE_REF_REQUIRED' as DomainErrors }),
	platform: z.enum(BillingPlatform),
	ownerId: z.instance(Id),
	gatewayTxId: z.string().min(1),
	invoiceId: z.instance(Id),
	amountCents: z.number().int().nonnegative(),
	status: z.enum(DisputeStatus),
	openedAt: z.date(),
	closedAt: z.date().optional(),
})

export type DisputeProps = Z.infer<typeof DisputeSchema>

// WON and LOST are absorbing — a closed dispute never reopens nor swaps outcome.
const VALID_TRANSITIONS: Record<DisputeStatus, DisputeStatus[]> = {
	[DisputeStatus.OPEN]: [DisputeStatus.WON, DisputeStatus.LOST],
	[DisputeStatus.WON]: [],
	[DisputeStatus.LOST]: [],
}

export class Dispute extends AggregateRoot<typeof DisputeSchema> {
	static override schema = DisputeSchema

	static create(data: {
		gatewayDisputeRef: string
		platform: BillingPlatform
		ownerId: string
		gatewayTxId: string
		invoiceId: string
		amountCents: number
		openedAt?: Date
	}): Dispute {
		return new Dispute({
			gatewayDisputeRef: data.gatewayDisputeRef,
			platform: data.platform,
			ownerId: data.ownerId,
			gatewayTxId: data.gatewayTxId,
			invoiceId: data.invoiceId,
			amountCents: data.amountCents,
			status: DisputeStatus.OPEN,
			openedAt: data.openedAt ?? new Date(),
		})
	}

	/** dispute.closed in the merchant's favor — the matching CN is reversed by the handler. */
	won(closedAt?: Date): void {
		this.transitionTo(DisputeStatus.WON, closedAt)
	}

	/** dispute.closed in the cardholder's favor — the CN stays active (money reversed); only the state changes. */
	lose(closedAt?: Date): void {
		this.transitionTo(DisputeStatus.LOST, closedAt)
	}

	private transitionTo(next: DisputeStatus, closedAt?: Date): void {
		const allowed = VALID_TRANSITIONS[this.status]
		if (!allowed.includes(next)) {
			throw new BaseError<DomainErrors>('INVALID_DISPUTE_TRANSITION', `dispute ${this.gatewayDisputeRef}: ${this.status} -> ${next}`)
		}
		this.status = next
		this.closedAt = closedAt ?? new Date()
		this.validate()
	}
}

// Declaration merging — interface BELOW class
export interface Dispute extends DisputeProps {}
