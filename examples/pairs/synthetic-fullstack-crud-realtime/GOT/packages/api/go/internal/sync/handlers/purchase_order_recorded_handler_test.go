package handlers

import (
	"context"
	"encoding/json"
	"testing"

	wire "template/contracts-go/wire"
	"template/core-go/types"
)

func rawPurchaseOrderRecorded(purchaseOrderID, storeID string, status wire.PurchaseOrderStatus) types.IntegrationEventI {
	raw, _ := json.Marshal(map[string]any{
		"name":            wire.PurchaseOrderRecordedEventName,
		"purchaseOrderId": purchaseOrderID,
		"storeId":         storeID,
		"supplierName":    "Acme Supplies",
		"status":          string(status),
		"totalAmountCents": int64(100000),
		"currency":        string(wire.CurrencyCodeBRL),
	})
	return &fakeRawEvent{name: wire.PurchaseOrderRecordedEventName, raw: raw}
}

func TestPurchaseOrderRecordedHandler_EventName(t *testing.T) {
	h := NewPurchaseOrderRecordedHandler()
	if h.EventName() != wire.PurchaseOrderRecordedEventName {
		t.Fatalf("EventName = %q, want %q", h.EventName(), wire.PurchaseOrderRecordedEventName)
	}
}

func TestPurchaseOrderRecordedHandler_Handle_Succeeds(t *testing.T) {
	h := NewPurchaseOrderRecordedHandler()
	evt := rawPurchaseOrderRecorded("po-1", "store-1", wire.PurchaseOrderStatusPLACED)
	if err := h.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle: %v", err)
	}
}

func TestPurchaseOrderRecordedHandler_WrongEventType(t *testing.T) {
	h := NewPurchaseOrderRecordedHandler()
	other := types.NewDomainEvent("some.other.event", [16]byte{}, "", struct{}{})
	if err := h.Handle(context.Background(), other); err == nil {
		t.Error("expected error for wrong event type, got nil")
	}
}
