package handlers

import (
	"context"
	"encoding/json"
	"fmt"

	wire "template/contracts-go/wire"
	"template/core-go/types"
)

// purchaseOrderAuditWriter persists an audit row for a consumed PurchaseOrderRecordedEvent.
// Satisfied by PgPurchaseOrderAuditRepository and the fake used in tests.
type purchaseOrderAuditWriter interface {
	InsertAudit(ctx context.Context, row PurchaseOrderAuditRow) error
}

// PurchaseOrderAuditRow carries the columns for one audit entry.
type PurchaseOrderAuditRow struct {
	PurchaseOrderID     string
	StoreID             string
	SupplierName        string
	Status              string
	TotalAmountCents    int64
	TotalAmountCurrency string
}

// PurchaseOrderRecordedHandler consumes integration.shared.purchase_order.recorded
// and appends a row to the procurement.purchase_order_audit table.
type PurchaseOrderRecordedHandler struct {
	repo purchaseOrderAuditWriter
}

// NewPurchaseOrderRecordedHandler wires the handler with its audit repository.
func NewPurchaseOrderRecordedHandler(repo purchaseOrderAuditWriter) *PurchaseOrderRecordedHandler {
	return &PurchaseOrderRecordedHandler{repo: repo}
}

// EventName returns the integration event name this handler listens on.
func (h *PurchaseOrderRecordedHandler) EventName() string {
	return wire.PurchaseOrderRecordedEventName
}

// Handle decodes the event and inserts an audit row.
func (h *PurchaseOrderRecordedHandler) Handle(ctx context.Context, event types.IntegrationEventI) error {
	provider, ok := event.(interface{ GetPayload() json.RawMessage })
	if !ok {
		return fmt.Errorf("purchase_order_recorded handler: event %s carries no payload", event.GetEventName())
	}

	decoded, err := wire.UnmarshalIntegrationEvent(provider.GetPayload())
	if err != nil {
		return fmt.Errorf("purchase_order_recorded handler: unmarshal: %w", err)
	}

	ev, ok := decoded.(wire.PurchaseOrderRecordedEvent)
	if !ok {
		return fmt.Errorf("purchase_order_recorded handler: unexpected event type %T", decoded)
	}

	row := PurchaseOrderAuditRow{
		PurchaseOrderID:     ev.PurchaseOrderID,
		StoreID:             ev.StoreID,
		SupplierName:        ev.SupplierName,
		Status:              string(ev.Status),
		TotalAmountCents:    ev.TotalAmountCents,
		TotalAmountCurrency: string(ev.TotalAmountCurrency),
	}

	if err := h.repo.InsertAudit(ctx, row); err != nil {
		return fmt.Errorf("purchase_order_recorded handler: insert audit: %w", err)
	}

	return nil
}
