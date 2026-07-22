import { injectable } from 'tsyringe-neo'
import { BillingWebhookSource } from '@billing/enums'
import { BillingWebhookVerifier } from './BillingWebhookVerifier'
import { PagarMeWebhookVerifier } from './PagarMeWebhookVerifier'
import { StripeWebhookVerifier } from './StripeWebhookVerifier'
import { AsaasWebhookVerifier } from './AsaasWebhookVerifier'
import { MercadoPagoWebhookVerifier } from './MercadoPagoWebhookVerifier'
import { PagBankWebhookVerifier } from './PagBankWebhookVerifier'

/**
 * Source-keyed verifier resolver. Adding a provider = constructor-inject the new
 * verifier + extend the table. No controller / use case changes.
 */
@injectable()
export class BillingWebhookVerifierFactory {
	private readonly verifiers: Partial<Record<BillingWebhookSource, BillingWebhookVerifier>>

	constructor(
		pagarMe: PagarMeWebhookVerifier,
		stripe: StripeWebhookVerifier,
		asaas: AsaasWebhookVerifier,
		mercadoPago: MercadoPagoWebhookVerifier,
		pagBank: PagBankWebhookVerifier,
	) {
		this.verifiers = {
			[BillingWebhookSource.PAGARME]: pagarMe,
			[BillingWebhookSource.STRIPE]: stripe,
			[BillingWebhookSource.ASAAS]: asaas,
			[BillingWebhookSource.MERCADOPAGO]: mercadoPago,
			[BillingWebhookSource.PAGBANK]: pagBank,
		}
	}

	get(source: BillingWebhookSource): BillingWebhookVerifier | undefined {
		return this.verifiers[source]
	}
}
