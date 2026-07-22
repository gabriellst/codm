import { pgSchema, uuid, text, timestamp, integer, bigint, index } from 'drizzle-orm/pg-core'

/**
 * `procurement` is BK Dash's supplier purchase-order schema.
 *
 * TS-owned aggregates. The Go-side consumer persists audit rows in a
 * separate `purchase_order_audit` table (managed by golang-migrate).
 *
 * Tables:
 *   - `purchase_orders` — one row per supplier purchase order
 */
export const procurementSchema = pgSchema('procurement')

/**
 * `purchase_orders` — supplier purchase order ledger.
 *
 * `status` mirrors PurchaseOrderStatus enum (DRAFT | PLACED | CANCELLED).
 * `total_amount_cents` + `currency` are the canonical wire money shape.
 * Soft-delete is NOT needed — CANCELLED is the terminal state; cancelled
 * orders remain visible for audit history.
 */
export const purchaseOrders = procurementSchema.table(
	'purchase_orders',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		storeId: uuid('store_id').notNull(),

		// Supplier display name ("Supplier ACME", "Ali Express", …)
		supplierName: text('supplier_name').notNull(),

		// PurchaseOrderStatus enum (DRAFT | PLACED | CANCELLED).
		status: text('status').notNull(),

		totalAmountCents: bigint('total_amount_cents', { mode: 'bigint' }).notNull(),
		currency: text('currency').notNull(),

		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		version: integer('version').notNull().default(1),
	},
	t => ({
		storeIdx: index('purchase_orders_store_id_idx').on(t.storeId),
		statusIdx: index('purchase_orders_status_idx').on(t.status),
		storeCreatedIdx: index('purchase_orders_store_created_idx').on(t.storeId, t.createdAt),
	}),
)
