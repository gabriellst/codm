import "./_base.tsp";

namespace TemplateContracts;

@doc("Published by TS Procurement after CreatePurchaseOrder or CancelPurchaseOrder. Carries storeId for SSE tenancy filtering — the SSE broadcaster's guard depends on this field being present at the top level.")
model PurchaseOrderRecordedEvent extends IntegrationEvent {
  name: "integration.shared.purchase_order.recorded";

  @doc("UUID of the PurchaseOrder aggregate. Mirrors entityId.")
  purchaseOrderId: string;

  @doc("Owning Store UUID — required for SSE tenancy filter.")
  storeId: string;

  @doc("Name of the supplier.")
  supplierName: string;

  @doc("Current lifecycle status of the purchase order.")
  status: PurchaseOrderStatus;

  @doc("Order total in cents.")
  totalAmountCents: int64;

  @doc("Currency of totalAmountCents.")
  currency: CurrencyCode;
}
