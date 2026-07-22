package handlers

import (
	"context"
	"database/sql"
)

const insertPurchaseOrderAuditSQL = `
INSERT INTO procurement.purchase_order_audit
  (purchase_order_id, store_id, supplier_name, status,
   total_amount_cents, total_amount_currency, occurred_at)
VALUES ($1, $2, $3, $4, $5, $6, NOW())`

// PgPurchaseOrderAuditRepository writes audit rows to procurement.purchase_order_audit
// using raw database/sql — no ORM.
type PgPurchaseOrderAuditRepository struct {
	db *sql.DB
}

// NewPgPurchaseOrderAuditRepository constructs the repository.
func NewPgPurchaseOrderAuditRepository(db *sql.DB) *PgPurchaseOrderAuditRepository {
	return &PgPurchaseOrderAuditRepository{db: db}
}

var _ purchaseOrderAuditWriter = (*PgPurchaseOrderAuditRepository)(nil)

// InsertAudit appends one audit row for a consumed PurchaseOrderRecordedEvent.
func (r *PgPurchaseOrderAuditRepository) InsertAudit(ctx context.Context, row PurchaseOrderAuditRow) error {
	_, err := r.db.ExecContext(ctx, insertPurchaseOrderAuditSQL,
		row.PurchaseOrderID,
		row.StoreID,
		row.SupplierName,
		row.Status,
		row.TotalAmountCents,
		row.TotalAmountCurrency,
	)
	return err
}
