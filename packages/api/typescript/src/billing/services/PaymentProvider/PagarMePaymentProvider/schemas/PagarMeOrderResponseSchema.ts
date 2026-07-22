import type Z from 'zod'
import { z } from '@template/core-typescript'

// v5 charge/order response — only the fields we read. A single-charge GET (`ch_…`) is a FLAT
// GetChargeResponse at the ROOT (no `charges[]`); an order GET (`or_…`) wraps them in `charges[]`.
// Refund in v5 == "the paid charge was canceled": `canceled_amount` (minor units) carries the
// refunded total; `last_transaction.id` (`tran_…`) is the canonical refund/cancel transaction id.
// Confirmed against the official pagarme-core-api SDK models (2026-07-15). `id` is the only
// invariant; everything else is lenient so a new/missing field never fails the whole parse.
const PagarMeChargeShape = {
	id: z.string().nullish(),
	status: z.string().nullish(),
	// v5's refunded amount (NOT `amount_refunded`, which does not exist). Present on both the flat
	// charge GET (root) and each element of an order GET's charges[].
	canceled_amount: z.number().nullish(),
	paid_amount: z.number().nullish(),
	last_transaction: z
		.object({
			id: z.string().nullish(),
			status: z.string().nullish(),
			acquirer_message: z.string().nullish(),
			// The payment-method family (`credit_card`/`pix`/…), NOT a refund flag. Kept for
			// diagnostics only — a refund is detected by canceled_amount>0, never by this value.
			transaction_type: z.string().nullish(),
			amount: z.number().nullish(),
		})
		.nullish(),
}

export const PagarMeOrderResponseSchema = z.object({
	...PagarMeChargeShape, // flat charge GET: refund fields live at the ROOT
	charges: z.array(z.object(PagarMeChargeShape)).nullish(), // order GET: wrapped here
})

export type PagarMeOrderResponse = Z.infer<typeof PagarMeOrderResponseSchema>
