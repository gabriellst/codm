import { injectable } from 'tsyringe-neo'
import { BillingWebhookSource } from '@billing/enums'
import { BillingWebhookMapper } from './BillingWebhookMapper'
import { PagarMeWebhookMapper } from './PagarMeWebhookMapper'
import { StripeWebhookMapper } from './StripeWebhookMapper'
import { AsaasWebhookMapper } from './AsaasWebhookMapper'
import { MercadoPagoWebhookMapper } from './MercadoPagoWebhookMapper'
import { PagBankWebhookMapper } from './PagBankWebhookMapper'

/**
 * Source-keyed mapper resolver. Adding a provider = constructor-inject the new
 * mapper + extend the table. No controller / use case changes.
 */
@injectable()
export class BillingWebhookMapperFactory {
	private readonly mappers: Partial<Record<BillingWebhookSource, BillingWebhookMapper>>

	constructor(
		pagarMe: PagarMeWebhookMapper,
		stripe: StripeWebhookMapper,
		asaas: AsaasWebhookMapper,
		mercadoPago: MercadoPagoWebhookMapper,
		pagBank: PagBankWebhookMapper,
	) {
		this.mappers = {
			[BillingWebhookSource.PAGARME]: pagarMe,
			[BillingWebhookSource.STRIPE]: stripe,
			[BillingWebhookSource.ASAAS]: asaas,
			[BillingWebhookSource.MERCADOPAGO]: mercadoPago,
			[BillingWebhookSource.PAGBANK]: pagBank,
		}
	}

	get(source: BillingWebhookSource): BillingWebhookMapper | undefined {
		return this.mappers[source]
	}
}
