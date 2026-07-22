import { injectable } from 'tsyringe-neo'
import { BaseError } from '@template/core-typescript'

import type { DomainErrors } from '@billing/errors'
import { InvoicePaymentStrategy } from './InvoicePaymentStrategy'
import { CardInvoicePaymentStrategy } from './CardInvoicePaymentStrategy'
import { PixInvoicePaymentStrategy } from './PixInvoicePaymentStrategy'
import type { SupportedPayInvoiceMethod } from './PayInvoiceSchemas'
import { PaymentMethodType } from '@template/contracts-typescript/wire/enums'

/**
 * Method-keyed strategy resolver — parallels `PaymentProviderFactory`: constructor-injected
 * concretes, `for(method)` lookup. The `satisfies` clause ties registry coverage to the
 * endpoint unions' method literals (compile-time exhaustiveness): compose a new leaf into
 * PayInvoiceSchemas without registering its strategy here and this stops compiling.
 *
 * Self-bound across every profile: the variability point is the STRATEGIES (abstract
 * `InvoicePaymentStrategy` leaves), not this deterministic wiring — same idiom as
 * PaymentProviderFactory/RefundPolicy.
 */
@injectable()
export class InvoicePaymentStrategyRegistry {
	private readonly strategies: Partial<Record<PaymentMethodType, InvoicePaymentStrategy>>

	constructor(card: CardInvoicePaymentStrategy, pix: PixInvoicePaymentStrategy) {
		this.strategies = {
			[PaymentMethodType.CARD]: card,
			[PaymentMethodType.PIX]: pix,
		} satisfies Record<SupportedPayInvoiceMethod, InvoicePaymentStrategy>
	}

	for(method: PaymentMethodType): InvoicePaymentStrategy {
		const strategy = this.strategies[method]
		if (!strategy) {
			throw new BaseError<DomainErrors>('PAYMENT_METHOD_UNSUPPORTED', `No InvoicePaymentStrategy registered for method ${method}`)
		}
		return strategy
	}
}
