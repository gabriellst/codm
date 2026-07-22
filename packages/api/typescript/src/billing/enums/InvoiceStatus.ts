// PAID = settled invoice; OVERDUE = a charge attempt failed and the invoice is still due.
// PENDING = invoice is due but not yet charged.
// REFUNDED = a settled invoice was fully refunded; PARTIALLY_REFUNDED = a settled
// invoice was refunded for less than its full amount; VOID = the invoice was voided.
// NEVER stored — always derived from ledger facts via InvoiceStatusDeriver.
export enum InvoiceStatus {
	PAID = 'PAID',
	OVERDUE = 'OVERDUE',
	PENDING = 'PENDING',
	REFUNDED = 'REFUNDED',
	PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
	VOID = 'VOID',
}
