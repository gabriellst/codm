// What a single invoice line represents (Invoice.lineItems[].kind — persisted in the
// invoice's line_items jsonb). SUBSCRIPTION = the period's base plan charge;
// PRORATION = mid-cycle plan-change adjustment; OVERAGE = metered usage beyond the
// plan quota (carries `meter` + the closed period); ADJUSTMENT = ad-hoc credit/debit.
export enum InvoiceLineKind {
	SUBSCRIPTION = 'SUBSCRIPTION',
	PRORATION = 'PRORATION',
	OVERAGE = 'OVERAGE',
	ADJUSTMENT = 'ADJUSTMENT',
}
