import { injectable } from 'tsyringe-neo'
import { BillingWebhookSource } from '@billing/enums'

import { ExternalCheckoutCompletedEvent } from '@billing/events/ExternalCheckoutCompletedEvent'
import { ExternalPixPaidEvent } from '@billing/events/ExternalPixPaidEvent'
import { ExternalChargeFailedEvent } from '@billing/events/ExternalChargeFailedEvent'
import { ExternalChargeRefundedEvent } from '@billing/events/ExternalChargeRefundedEvent'
import { InvoiceRepository } from '@billing/repositories'
import { BillingWebhookMapper, type ExternalBillingEvent } from '../BillingWebhookMapper'
import { PagBankWebhookSchema, type PagBankCharge } from './PagBankWebhookSchema'
import { BillingPlatform, CheckoutIntent } from '@template/contracts-typescript/wire/enums'

@injectable()
export class PagBankWebhookMapper extends BillingWebhookMapper {
	readonly source = BillingWebhookSource.PAGBANK

	constructor(private invoiceRepository: InvoiceRepository) {
		super()
	}

	async map(request: Request): Promise<ExternalBillingEvent[]> {
		const parsed = PagBankWebhookSchema.safeParse(await request.json())
		if (!parsed.success) return []
		const order = parsed.data

		// reference_id IS the engine invoice id (stamped by us at checkout/Pix mint time) — no
		// reference_id means we can't attribute the order to anything, no-op silently.
		const engineInvoiceId = order.reference_id
		if (!engineInvoiceId) return []

		// ownerId is resolved from the Invoice (keyed by the engine invoice id), NEVER trusted off
		// the gateway payload — same posture as every other mapper (Stripe/Pagar.me).
		const invoice = await this.invoiceRepository.findByEngineInvoiceId(engineInvoiceId)
		const ownerId = invoice?.ownerId.value
		if (!ownerId) return []

		const events: ExternalBillingEvent[] = []
		for (const charge of order.charges ?? []) {
			const event = this.eventForCharge(charge, order.id, engineInvoiceId, ownerId)
			if (event) events.push(event)
		}
		return events
	}

	// One Order can carry several charges (retries); each one resolves independently to at most
	// one fact. Unrecognized status/method combos (AUTHORIZED, IN_ANALYSIS, WAITING, …) are no-ops.
	private eventForCharge(
		charge: PagBankCharge,
		sessionRef: string,
		engineInvoiceId: string,
		ownerId: string,
	): ExternalBillingEvent | undefined {
		const base = {
			externalId: charge.id, // webhook dedup key — PagBank has no envelope-level event id
			ownerId,
			engineInvoiceId,
			amountCents: charge.amount.value,
			gatewayTxId: charge.id,
		}

		if (charge.status === 'PAID' && charge.payment_method?.type === 'CREDIT_CARD') {
			// PagBank never charges a card any other way (chargeOffSession/chargeStoredOnSession
			// both throw PROVIDER_CAPABILITY_UNSUPPORTED — capabilities.cardVaulting is false), so a
			// PAID card charge always originated from the hosted checkout — never an instrument,
			// checkout-only settles + activates without vaulting anything.
			return new ExternalCheckoutCompletedEvent({
				entityId: sessionRef,
				ownerId,
				payload: { ...base, sessionRef, intent: CheckoutIntent.PAYMENT, platform: BillingPlatform.PAGBANK },
			})
		}

		if (charge.status === 'PAID' && charge.payment_method?.type === 'PIX') {
			return new ExternalPixPaidEvent({ entityId: engineInvoiceId, ownerId, payload: base })
		}

		if (charge.status === 'DECLINED') {
			return new ExternalChargeFailedEvent({ entityId: engineInvoiceId, ownerId, payload: base })
		}

		if (charge.status === 'CANCELED') {
			return new ExternalChargeRefundedEvent({ entityId: engineInvoiceId, ownerId, payload: base })
		}

		return undefined
	}
}
