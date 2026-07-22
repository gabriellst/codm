namespace TemplateContracts;

@doc("Why a credit note was issued against an invoice. REFUND = merchant-initiated money-back; CHARGEBACK = bank-initiated reversal; CORRECTION = billing adjustment (mis-charge, proration fix).")
enum CreditNoteReason {
  REFUND: "REFUND",
  CHARGEBACK: "CHARGEBACK",
  CORRECTION: "CORRECTION",
}
