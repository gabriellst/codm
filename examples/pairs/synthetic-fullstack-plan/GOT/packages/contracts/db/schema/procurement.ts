import { pgSchema, uuid, text, timestamp, integer, bigint, index } from 'drizzle-orm/pg-core'

/**
 * `procurement` is BK Dash's BC Procurement schema.
 *
 * Owns supplier purchase order aggregates (TS-owned write-side).
 * The Go sync worker appends audit rows to `purchase_order_audit`
 * upon receiving the PurchaseOrderRecordedEvent integration event.
 *
 * Tables:
 *   - `purchase_orders`      — PurchaseOrder aggregate rows
 *   - `purchase_order_audit` — append-only audit log written by Go consumer
 */
export const procurementSchema = pgSchema('procurement')

/**
 * `purchase_orders` — one row per PurchaseOrder aggregate.
 * Status stored as text (values: DRAFT | PLACED | CANCELLED from PurchaseOrderStatus enum).
 * total_amount_cents uses bigint for exact integer arithmetic; JS safe-int ceiling is ~9 PB.
 */
export const purchaseOrders = procurementSchema.table(
	'purchase_orders',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		storeId: uuid('store_id').notNull(),

		supplierName: text('supplier_name').notNull(),

		// PurchaseOrderStatus enum (DRAFT | PLACED | CANCELLED).
		// Text avoids pgEnum migration coupling; validated at the application layer.
		status: text('status').notNull(),

		totalAmountCents: bigint('total_amount_cents', { mode: 'bigint' }).notNull(),
		totalAmountCurrency: text('total_amount_currency').notNull(),

		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		version: integer('version').notNull().default(1),
	},
	t => ({
		storeIdx: index('purchase_orders_store_id_idx').on(t.storeId),
		statusIdx: index('purchase_orders_status_idx').on(t.status),
	}),
)

/**
 * `purchase_order_audit` — append-only rows written by the Go sync worker
 * when it consumes the PurchaseOrderRecordedEvent integration event.
 * No updates or deletes — pure event log.
 */
export const purchaseOrderAudit = procurementSchema.table(
	'purchase_order_audit',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		purchaseOrderId: uuid('purchase_order_id').notNull(),
		storeId: uuid('store_id').notNull(),
		supplierName: text('supplier_name').notNull(),

		// Status snapshot at the time the event was consumed.
		status: text('status').notNull(),

		totalAmountCents: bigint('total_amount_cents', { mode: 'bigint' }).notNull(),
		totalAmountCurrency: text('total_amount_currency').notNull(),

		// RFC3339 timestamp from the integration event envelope.
		occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	t => ({
		purchaseOrderIdx: index('purchase_order_audit_order_id_idx').on(t.purchaseOrderId),
		storeIdx: index('purchase_order_audit_store_id_idx').on(t.storeId),
	}),
)
