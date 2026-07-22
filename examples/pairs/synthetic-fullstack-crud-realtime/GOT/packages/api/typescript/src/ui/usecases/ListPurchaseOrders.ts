import { injectable } from 'tsyringe-neo'
import { and, count, desc, eq } from 'drizzle-orm'
import { Handler, z, DrizzleClient } from '@codedm/core-typescript'
import { CurrencyCode, PurchaseOrderStatus } from '@codedm/contracts-typescript/wire/enums'
import { purchaseOrders } from '@codedm/contracts/db'

// ---------------------------------------------------------------------------
// Input — store-scoped paginated purchase orders read.
// ---------------------------------------------------------------------------
export const ListPurchaseOrdersInputSchema = z.object({
	storeId: z.uuid(),
	status: z.enum(PurchaseOrderStatus).optional(),
	page: z.number().int().min(1).default(1),
	limit: z.number().int().min(1).max(100).default(20),
})

// ---------------------------------------------------------------------------
// Output — paginated list of purchase order rows.
// ---------------------------------------------------------------------------
export const PurchaseOrderItemSchema = z.object({
	id: z.uuid(),
	supplierName: z.string(),
	status: z.enum(PurchaseOrderStatus),
	totalAmountCents: z.number().int(),
	currency: z.enum(CurrencyCode),
	createdAt: z.iso.datetime({ offset: true }),
})

export const ListPurchaseOrdersOutputSchema = z.paginatedResponse(PurchaseOrderItemSchema.shape)

/**
 * `ListPurchaseOrders` — paginated supplier purchase orders for the current store.
 * Real Drizzle query over `procurement.purchase_orders`.
 * Optional `status` filter; newest first.
 */
@injectable()
export class ListPurchaseOrders extends Handler<typeof ListPurchaseOrdersInputSchema, typeof ListPurchaseOrdersOutputSchema> {
	readonly name = 'list_purchase_orders' as const
	readonly inputSchema = ListPurchaseOrdersInputSchema
	readonly outputSchema = ListPurchaseOrdersOutputSchema

	constructor(private readonly db: DrizzleClient) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const filters = [eq(purchaseOrders.storeId, input.storeId)]
		if (input.status) filters.push(eq(purchaseOrders.status, input.status))
		const where = and(...filters)

		const [{ value: total } = { value: 0 }] = await this.db
			.select({ value: count() })
			.from(purchaseOrders)
			.where(where)

		const rows = await this.db
			.select()
			.from(purchaseOrders)
			.where(where)
			.orderBy(desc(purchaseOrders.createdAt))
			.limit(input.limit)
			.offset((input.page - 1) * input.limit)

		const items = rows.map(row => ({
			id: row.id,
			supplierName: row.supplierName,
			status: row.status as PurchaseOrderStatus,
			totalAmountCents: Number(row.totalAmountCents),
			currency: row.currency as CurrencyCode,
			createdAt: row.createdAt.toISOString(),
		}))

		return { items, total, totalPages: Math.max(1, Math.ceil(total / input.limit)) }
	}
}
