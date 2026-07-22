namespace TemplateContracts;

@doc("Lifecycle of a locally-recorded hosted-checkout session. PENDING is the only non-terminal status — a session is minted PENDING and moves exactly once to COMPLETED (payment/vault confirmed) or EXPIRED (gateway lapsed or its own expiresAt passed). Neither terminal status can be re-entered.")
enum CheckoutSessionStatus {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  EXPIRED: "EXPIRED",
}
