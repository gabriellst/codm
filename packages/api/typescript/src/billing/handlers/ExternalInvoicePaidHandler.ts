import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@template/core-typescript'
import { ExternalInvoicePaidEvent } from '@billing/events/ExternalInvoicePaidEvent'

import { ChargeSettler } from '@billing/services'
import { BillingPlatform, PaymentMethodType } from '@template/contracts-typescript/wire/enums'

@injectable()
export class ExternalInvoicePaidHandler extends EventHandler<typeof ExternalInvoicePaidEvent> {
	readonly event = ExternalInvoicePaidEvent

	constructor(private chargeSettler: ChargeSettler) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const ownerId = event.payload.ownerId
		const { engineInvoiceId, amountCents, externalId } = event.payload

		// Invoice-level settle. The payment was recorded out-of-band (no gateway tx of ours), so
		// synthesize a gateway ref from the event id; platform/method are the BRL default.
		// `settleCharge` claims INVOICE_SETTLED, writes the charge fact, and saves InvoicePaidEvent
		// all inside its own transaction — this handler makes no external call, so the previous
		// two-phase (claim-then-event) split isn't needed here. Cross-path dedup with Pagar.me card
		// (ExternalCardChargeSucceededHandler) and Pix (ExternalPixPaidHandler) — first path to claim
		// INVOICE_SETTLED wins.
		await this.chargeSettler.settleCharge({
			ownerId,
			engineInvoiceId,
			amountCents,
			platform: BillingPlatform.PAGARME,
			method: PaymentMethodType.CARD,
			gatewayTxId: `engine:${externalId}`,
		})
	}
}
