namespace TemplateContracts;

@doc("Reusable, off-session-capable instruments that can back recurring MIT (CARD, APPLE_PAY, GOOGLE_PAY) plus one-off rails never stored as a PaymentMethod (PIX, BOLETO).")
enum PaymentMethodType {
  CARD: "CARD",
  APPLE_PAY: "APPLE_PAY",
  GOOGLE_PAY: "GOOGLE_PAY",
  PIX: "PIX",
  BOLETO: "BOLETO",
}
