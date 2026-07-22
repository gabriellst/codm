import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@template/core-typescript'
import { ExternalPixPaidEvent } from '@billing/events/ExternalPixPaidEvent'

import { ChargeSettler } from '@billing/services'
import { BillingPlatform, PaymentMethodType } from '@template/contracts-typescript/wire/enums'

@injectable()
export class ExternalPixPaidHandler extends EventHandler<typeof ExternalPixPaidEvent> {
	readonly event = ExternalPixPaidEvent

	constructor(private chargeSettler: ChargeSettler) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const ownerId = event.payload.ownerId
		const { engineInvoiceId, amountCents, gatewayTxId } = event.payload

		// Invoice-level settle: Pix leaves NO prior charge, so `settleCharge`'s resolution ladder
		// creates one. The claim + charge fact + InvoicePaidEvent commit atomically inside
		// `settleCharge`'s own transaction (no external call on this path, so nothing needs to live
		// outside it). Cross-path dedup with the engine's invoice.paid (ExternalInvoicePaidHandler)
		// and Pagar.me card (ExternalCardChargeSucceededHandler) — first path to claim
		// INVOICE_SETTLED wins.
		await this.chargeSettler.settleCharge({
			ownerId,
			engineInvoiceId,
			amountCents,
			platform: BillingPlatform.PAGARME,
			method: PaymentMethodType.PIX,
			gatewayTxId,
		})
	}
}
