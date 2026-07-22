namespace TemplateContracts;

@doc("What a hosted-checkout session does: SETUP vaults an instrument without charging (card swap); PAYMENT charges the invoice on the hosted page (and vaults when the gateway returns a credential).")
enum CheckoutIntent {
  SETUP: "SETUP",
  PAYMENT: "PAYMENT",
}
