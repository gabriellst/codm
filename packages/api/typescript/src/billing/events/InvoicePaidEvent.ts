import { BaseDomainEvent, z } from '@template/core-typescript'
import { CurrencyCode } from '@template/contracts-typescript/wire/enums'
import { RecoveredVia } from '@billing/enums/RecoveredVia'

export const InvoicePaidEventSchema = z.domainEvent({
	ownerId: z.string().min(1),
	invoiceId: z.string().min(1),
	amountCents: z.number().int().nonnegative(),
	currency: z.enum(CurrencyCode),
	/**
	 * Settlement provenance, forwarded to the dunning lifecycle's onSettled so a dunning-recovered
	 * invoice is labelled correctly: RETRY = an off-session automatic re-charge, MANUAL =
	 * owner-driven pay (PIX / checkout / ad-hoc). Optional: most settle paths (and any replay of
	 * pre-existing events) omit it and default to MANUAL at the handler.
	 */
	recoveredVia: z.enum(RecoveredVia).optional(),
})

export class InvoicePaidEvent extends BaseDomainEvent<typeof InvoicePaidEventSchema> {
	static override readonly name = 'billing.invoice.paid' as const
	static readonly schema = InvoicePaidEventSchema
}
