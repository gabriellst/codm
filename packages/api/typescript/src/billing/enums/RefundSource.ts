// Who initiated the refund whose confirmation we await (the expectation marker in
// InvoiceRefundedEvent carries this so RefundReconcileJob can distinguish provenance when
// alerting/grouping).
export enum RefundSource {
	/** Operator command (RefundInvoice). */
	OPERATOR = 'operator',
	/** Consumer-protection/pro-rata policy requested by the user (RequestRefund). */
	POLICY = 'policy',
}
