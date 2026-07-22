package handlers

import (
	"context"
	"encoding/json"
	"testing"

	wire "template/contracts-go/wire"
	"template/core-go/types"
)

// fakePurchaseOrderAuditRepo records every InsertAudit call.
type fakePurchaseOrderAuditRepo struct {
	rows []PurchaseOrderAuditRow
}

func (f *fakePurchaseOrderAuditRepo) InsertAudit(_ context.Context, row PurchaseOrderAuditRow) error {
	f.rows = append(f.rows, row)
	return nil
}

// rawPurchaseOrderRecordedEvent builds a minimal fakeRawEvent carrying the
// purchase_order.recorded payload so the handler's UnmarshalIntegrationEvent path is exercised.
func rawPurchaseOrderRecordedEvent() types.IntegrationEventI {
	raw := []byte(`{
		"name":"integration.shared.purchase_order.recorded",
		"entityId":"po-001",
		"ownerId":"store-001",
		"occurredAt":"2026-06-13T00:00:00Z",
		"storeId":"store-001",
		"purchaseOrderId":"po-001",
		"supplierName":"Acme Supplies",
		"status":"PLACED",
		"totalAmountCents":100000,
		"totalAmountCurrency":"BRL"
	}`)
	return &fakeRawEvent{name: wire.PurchaseOrderRecordedEventName, raw: raw}
}

func TestPurchaseOrderRecordedHandler_InsertsAuditRow(t *testing.T) {
	repo := &fakePurchaseOrderAuditRepo{}
	h := NewPurchaseOrderRecordedHandler(repo)

	if err := h.Handle(context.Background(), rawPurchaseOrderRecordedEvent()); err != nil {
		t.Fatalf("Handle: %v", err)
	}

	if len(repo.rows) != 1 {
		t.Fatalf("expected 1 audit row, got %d", len(repo.rows))
	}

	row := repo.rows[0]
	if row.PurchaseOrderID != "po-001" {
		t.Errorf("PurchaseOrderID = %q, want po-001", row.PurchaseOrderID)
	}
	if row.StoreID != "store-001" {
		t.Errorf("StoreID = %q, want store-001", row.StoreID)
	}
	if row.SupplierName != "Acme Supplies" {
		t.Errorf("SupplierName = %q, want Acme Supplies", row.SupplierName)
	}
	if row.Status != "PLACED" {
		t.Errorf("Status = %q, want PLACED", row.Status)
	}
	if row.TotalAmountCents != 100_000 {
		t.Errorf("TotalAmountCents = %d, want 100000", row.TotalAmountCents)
	}
	if row.TotalAmountCurrency != "BRL" {
		t.Errorf("TotalAmountCurrency = %q, want BRL", row.TotalAmountCurrency)
	}
}

func TestPurchaseOrderRecordedHandler_EventName(t *testing.T) {
	h := NewPurchaseOrderRecordedHandler(&fakePurchaseOrderAuditRepo{})
	want := wire.PurchaseOrderRecordedEventName
	if h.EventName() != want {
		t.Errorf("EventName = %q, want %q", h.EventName(), want)
	}
}

func TestPurchaseOrderRecordedHandler_WrongEventType(t *testing.T) {
	repo := &fakePurchaseOrderAuditRepo{}
	h := NewPurchaseOrderRecordedHandler(repo)

	other := &fakeRawEvent{
		name: "some.other.event",
		raw:  json.RawMessage(`{"name":"some.other.event"}`),
	}
	if err := h.Handle(context.Background(), other); err == nil {
		t.Error("expected error for wrong event type, got nil")
	}
	if len(repo.rows) != 0 {
		t.Errorf("expected 0 rows on wrong event, got %d", len(repo.rows))
	}
}
