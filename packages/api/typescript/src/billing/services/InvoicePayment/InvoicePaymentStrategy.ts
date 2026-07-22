// services/InvoicePayment/InvoicePaymentStrategy.ts — one strategy per PaymentMethodType behind the
// single manual payment verb (`POST /invoices/:engineInvoiceId/pay`). The endpoint's discriminated
// input/output unions are COMPOSED from each strategy's leaf schemas (see PayInvoiceSchemas.ts), so
// adding a method = adding a strategy + registering it — the usecase/controller never change.
import type Z from 'zod'
import type { ZodType } from 'zod'
import type { Transaction } from '@template/core-typescript'

import type { Invoice } from '@billing/entities'
import { PaymentMethodType, SubscriptionStatus } from '@template/contracts-typescript/wire/enums'

/**
 * Resolved ONCE by the PayInvoice usecase (invoice + ownership already asserted,
 * subscription status already read) — strategies never re-fetch or re-guard it.
 */
export interface PayInvoiceContext {
	ownerId: string
	invoice: Invoice
	subscriptionStatus: SubscriptionStatus | undefined
}

export abstract class InvoicePaymentStrategy<InputSchema extends ZodType = ZodType, OutputSchema extends ZodType = ZodType> {
	abstract readonly method: PaymentMethodType
	/** The union LEAF this strategy contributes to the endpoint's `payment` input union. */
	abstract readonly inputSchema: InputSchema
	/** The union LEAF this strategy contributes to the endpoint's response union. */
	abstract readonly outputSchema: OutputSchema

	abstract execute(ctx: PayInvoiceContext, input: Z.output<InputSchema>, tx?: Transaction): Promise<Z.output<OutputSchema>>
}
