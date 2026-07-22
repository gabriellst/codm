namespace TemplateContracts;

@doc("Lifecycle of a credit note. ISSUED = recorded but not yet reconciled; SETTLED = credit applied/paid out; REVERSED = credit voided (dispute-won chargeback CN) and no longer credits the invoice — the derivation excludes REVERSED notes so the invoice backs access again.")
enum CreditNoteStatus {
  ISSUED: "ISSUED",
  SETTLED: "SETTLED",
  REVERSED: "REVERSED",
}
