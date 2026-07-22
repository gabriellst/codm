// objects/PaymentInstrument.ts — the reusable vaulted instrument, DISCRIMINATED on type.
// Card-only fields (brand/last4/exp) live ONLY on the CARD leaf; wallet leaves carry their own concrete shape.
import Z from 'zod'
import { z } from '@template/core-typescript'
import { PaymentMethodType } from '@template/contracts-typescript/wire/enums'
import { CaptureOrigin } from '../enums/CaptureOrigin'

// Where the instrument was born — see the CaptureOrigin enum (billing/enums/CaptureOrigin)
// for member semantics. Re-exported here so instrument consumers get schema + enum together.
export const CaptureOriginSchema = z.enum(CaptureOrigin)
export { CaptureOrigin }

// every instrument is a chargeable token
const reusable = {
	pmRef: z.string().min(1),
	supportsOffSession: z.boolean(),
	captureOrigin: CaptureOriginSchema.optional(),
	// The gateway tx id of the checkout CIT — subsequent MIT charges reference it in the
	// stored-credential chain (chargeOffSession's originGatewayTxId).
	originGatewayTxId: z.string().min(1).optional(),
}

const CardInstrumentSchema = z.object({
	type: z.literal(PaymentMethodType.CARD),
	...reusable,
	brand: z.string(),
	last4: z.string().length(4),
	expMonth: z.number().int().min(1).max(12),
	expYear: z.number().int(),
})
const ApplePayInstrumentSchema = z.object({
	type: z.literal(PaymentMethodType.APPLE_PAY),
	...reusable,
	network: z.string(),
	last4: z.string().length(4),
}) // underlying DPAN display; no exp
const GooglePayInstrumentSchema = z.object({
	type: z.literal(PaymentMethodType.GOOGLE_PAY),
	...reusable,
	network: z.string(),
	last4: z.string().length(4),
})

export const PaymentInstrumentSchema = z.discriminatedUnion('type', [
	CardInstrumentSchema,
	ApplePayInstrumentSchema,
	GooglePayInstrumentSchema,
])
export type PaymentInstrument = Z.infer<typeof PaymentInstrumentSchema>
