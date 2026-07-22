import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@template/core-typescript'

import { ExternalCardChargeSucceededEvent } from '@billing/events/ExternalCardChargeSucceededEvent'
import { PaymentMethodRepository } from '@billing/repositories'
import { ChargeSettler } from '@billing/services'
import { RecoveredVia } from '@billing/enums/RecoveredVia'
import { BillingPlatform, PaymentMethodType } from '@template/contracts-typescript/wire/enums'

@injectable()
export class ExternalCardChargeSucceededHandler extends EventHandler<typeof ExternalCardChargeSucceededEvent> {
	readonly event = ExternalCardChargeSucceededEvent

	constructor(
		private paymentMethodRepository: PaymentMethodRepository,
		private chargeSettler: ChargeSettler,
	) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const ownerId = event.payload.ownerId
		const { externalId, engineInvoiceId, amountCents, gatewayTxId, platform: eventPlatform } = event.payload
		// Settles emitted by ExternalCheckoutCompletedHandler carry the `<sessionRef>:settle`
		// externalId — the money was collected ON the hosted page, so activation must not require
		// a vaulted off-session card (CHECKOUT-ONLY providers never vault; renewals degrade to
		// the manual-pay flow by design).
		const fromCheckout = externalId.endsWith(':settle')

		// This handler NEVER vaults — both gateways vault the card at CHECKOUT, via
		// ExternalCheckoutCompletedHandler (Stripe's SetupIntent attach, Pagar.me's
		// POST /customers/:id/cards), and CreateSubscription's PAYMENT_METHOD_REQUIRED guard
		// enforces a vaulted default before subscribing. So a card charge always settles off the
		// already-stored card. Gate on the owner actually holding a recurrence-capable card: a
		// card charge without one is an anomaly (nothing to back MIT renewals) — keep INCOMPLETE
		// rather than activate a non-renewable subscription. (Pix is a separate outcome →
		// ExternalPixPaidHandler, so this card path never needs to disambiguate one-offs.)
		const card = await this.paymentMethodRepository.findActiveByOwnerId(ownerId)
		if (!fromCheckout && !card?.instrument.supportsOffSession) return

		// The platform that captured THIS charge. For a checkout settle, the EVENT's forwarded
		// platform wins: the money was collected on THAT gateway's hosted page, and an owner may
		// hold a stale vaulted card from a previous gateway — routing the charge fact (and a
		// possible dup-refund inside settleCharge) by card.platform would hit the wrong gateway with
		// this gatewayTxId. A raw (non-checkout) webhook never forwards a platform, so it falls
		// through to the vaulted card's own gateway, which is authoritative for an off-session (MIT)
		// charge — that path never reaches here without a card (gated above), so the PAGARME
		// fallback stays unreachable — it only keeps the type total.
		const platform = eventPlatform ?? card?.platform ?? BillingPlatform.PAGARME
		const method = card?.instrument.type ?? PaymentMethodType.CARD

		await this.chargeSettler.settleCharge({
			ownerId,
			engineInvoiceId,
			amountCents,
			platform,
			method,
			gatewayTxId,
			// A card capture for an already-settled invoice is a genuine duplicate (checkout-CIT ×
			// manual-pay race) → refund it.
			refundDuplicate: true,
			// Provenance for a dunning-recovered invoice: an off-session capture here is the automatic
			// retry path (RETRY); a checkout settle is the owner paying on the hosted page (MANUAL).
			// Ignored unless the invoice had prior FAILED charges (onSettled gates on that).
			recoveredVia: fromCheckout ? RecoveredVia.MANUAL : RecoveredVia.RETRY,
		})
	}
}
