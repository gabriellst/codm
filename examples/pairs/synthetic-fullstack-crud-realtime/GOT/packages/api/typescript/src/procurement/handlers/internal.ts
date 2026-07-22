// Bridges procurement domain events to the integration.shared.purchase_order.recorded
// integration event (PurchaseOrderRecordedEvent from @template/contracts-typescript)
// published on the external mediator.
import type { PurchaseOrderRecordedEvent } from '@template/contracts-typescript/wire/events'
export type { PurchaseOrderRecordedEvent }
export { PurchaseOrderCreatedRecordedHandler, PurchaseOrderCancelledRecordedHandler } from './PurchaseOrderRecordedHandler'
