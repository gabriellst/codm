import { z } from '@template/core-typescript'
import type Z from 'zod'
import { QuotaKey } from '@template/contracts-typescript/wire/enums'
import { InvoiceLineKind } from '../enums/InvoiceLineKind'

// A single line on an invoice's `line_items` jsonb. Persisted as part of the
// invoice ledger. kind = what the line represents; amountCents = signed line total (cents).
export const InvoiceLineSchema = z.object({
	kind: z.enum(InvoiceLineKind),
	description: z.string(),
	amountCents: z.number().int(),
	// The metered quota an OVERAGE line bills — same vocabulary the plan quotas speak.
	meter: z.enum(QuotaKey).optional(),
	quantity: z.number().optional(),
	// coerce (not plain z.date()) so a line's period round-trips through the invoice's jsonb column:
	// a Date passes through unchanged on write, and the ISO string read back from jsonb re-coerces
	// to a Date. An OVERAGE line carries the closed period this way.
	periodStart: z.coerce.date().optional(),
	periodEnd: z.coerce.date().optional(),
})

export type InvoiceLine = Z.infer<typeof InvoiceLineSchema>
