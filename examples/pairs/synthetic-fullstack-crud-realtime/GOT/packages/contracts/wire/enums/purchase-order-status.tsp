namespace TemplateContracts;

@doc("Status of a supplier purchase order. DRAFT = not yet submitted to supplier, PLACED = submitted, CANCELLED = annulled.")
enum PurchaseOrderStatus {
  DRAFT: "DRAFT",
  PLACED: "PLACED",
  CANCELLED: "CANCELLED",
}
