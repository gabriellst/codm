namespace TemplateContracts;

@doc("Lifecycle of a stored payment instrument.")
enum PaymentMethodStatus {
  ACTIVE: "ACTIVE",
  EXPIRED: "EXPIRED",
  REMOVED: "REMOVED",
}
