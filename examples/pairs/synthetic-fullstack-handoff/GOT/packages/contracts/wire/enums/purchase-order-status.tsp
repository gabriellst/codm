namespace TemplateContracts;

@doc("Lifecycle status of a supplier purchase order.")
enum PurchaseOrderStatus {
  DRAFT: "DRAFT",
  PLACED: "PLACED",
  CANCELLED: "CANCELLED",
}
