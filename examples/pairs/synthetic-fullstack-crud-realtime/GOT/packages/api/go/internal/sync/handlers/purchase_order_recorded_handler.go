package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"template/contracts-go/wire"
	"template/core-go/types"
)

// PurchaseOrderRecordedHandler consumes integration.shared.purchase_order.recorded
// events published by TS Procurement after CreatePurchaseOrder or CancelPurchaseOrder.
// Extend with a storage write when a Go read-model for purchase orders is needed.
type PurchaseOrderRecordedHandler struct{}

// NewPurchaseOrderRecordedHandler constructs the handler.
func NewPurchaseOrderRecordedHandler() *PurchaseOrderRecordedHandler {
	return &PurchaseOrderRecordedHandler{}
}

// EventName returns the integration event name this handler listens on.
func (h *PurchaseOrderRecordedHandler) EventName() string {
	return wire.PurchaseOrderRecordedEventName
}

// Handle decodes the event and logs the purchase order record.
func (h *PurchaseOrderRecordedHandler) Handle(ctx context.Context, event types.IntegrationEventI) error {
	decoded, err := decodePurchaseOrderRecorded(event)
	if err != nil {
		return err
	}
	slog.InfoContext(ctx, "purchase_order.recorded",
		"purchaseOrderId", decoded.PurchaseOrderID,
		"storeId", decoded.StoreID,
		"status", decoded.Status,
	)
	return nil
}

func decodePurchaseOrderRecorded(event types.IntegrationEventI) (wire.PurchaseOrderRecordedEvent, error) {
	provider, ok := event.(interface{ GetPayload() json.RawMessage })
	if !ok {
		return wire.PurchaseOrderRecordedEvent{}, fmt.Errorf("event %s carries no payload", event.GetEventName())
	}
	decoded, err := wire.UnmarshalIntegrationEvent(provider.GetPayload())
	if err != nil {
		return wire.PurchaseOrderRecordedEvent{}, err
	}
	v, ok := decoded.(wire.PurchaseOrderRecordedEvent)
	if !ok {
		return wire.PurchaseOrderRecordedEvent{}, fmt.Errorf("unexpected event type %T", decoded)
	}
	return v, nil
}
