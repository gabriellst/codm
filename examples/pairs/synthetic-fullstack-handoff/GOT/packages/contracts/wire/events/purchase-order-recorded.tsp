import "./_base.tsp";

namespace TemplateContracts;

@doc("Published by TS Procurement after `CreatePurchaseOrder` or `CancelPurchaseOrder` mutates a PurchaseOrder aggregate. Go sync consumer persists an audit row; the React list live-updates via SSE invalidation.")
model PurchaseOrderRecordedEvent extends IntegrationEvent {
  name: "integration.shared.purchase_order.recorded";

  @doc("Owning Store.")
  storeId: string;

  @doc("PurchaseOrder aggregate id. Mirrors entityId.")
  purchaseOrderId: string;

  @doc("Supplier display name for the audit row.")
  supplierName: string;

  @doc("Current lifecycle status of the order.")
  status: PurchaseOrderStatus;

  @doc("Total amount in cents.")
  totalAmountCents: int64;

  @doc("ISO-4217 currency of totalAmountCents.")
  totalAmountCurrency: CurrencyCode;
}
