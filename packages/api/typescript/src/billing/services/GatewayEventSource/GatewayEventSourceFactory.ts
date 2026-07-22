import { injectable } from 'tsyringe-neo'
import { BillingWebhookSource } from '@billing/enums'
import { GatewayEventSource } from './GatewayEventSource'
import { PagarMeEventSource } from './PagarMeEventSource'
import { StripeEventSource } from './StripeEventSource'
import { AsaasEventSource } from './AsaasEventSource'
import { MercadoPagoEventSource } from './MercadoPagoEventSource'
import { PagBankEventSource } from './PagBankEventSource'

/**
 * Source-keyed GatewayEventSource resolver — exact structural mirror of
 * BillingWebhookMapperFactory. Adding a platform = constructor-inject its concrete source +
 * extend the table. No caller (WindowReconcileJob) changes.
 */
@injectable()
export class GatewayEventSourceFactory {
	private readonly sources: Partial<Record<BillingWebhookSource, GatewayEventSource>>

	constructor(
		pagarMe: PagarMeEventSource,
		stripe: StripeEventSource,
		asaas: AsaasEventSource,
		mercadoPago: MercadoPagoEventSource,
		pagBank: PagBankEventSource,
	) {
		this.sources = {
			[BillingWebhookSource.PAGARME]: pagarMe,
			[BillingWebhookSource.STRIPE]: stripe,
			[BillingWebhookSource.ASAAS]: asaas,
			[BillingWebhookSource.MERCADOPAGO]: mercadoPago,
			[BillingWebhookSource.PAGBANK]: pagBank,
		}
	}

	get(source: BillingWebhookSource): GatewayEventSource | undefined {
		return this.sources[source]
	}
}
