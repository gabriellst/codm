import { injectable } from 'tsyringe-neo'
import { and, count, desc, eq, ilike } from 'drizzle-orm'
import { Handler, z, DrizzleClient } from '@template/core-typescript'
import { CurrencyCode, PurchaseOrderStatus } from '@template/contracts-typescript/wire/enums'
import { purchaseOrders } from '@template/contracts/db'

// ---------------------------------------------------------------------------
// Input — store-scoped paginated purchase orders read. page/limit/search mirror
// z.paginatedQuery output; status narrows to a specific lifecycle state.
// ---------------------------------------------------------------------------
export const ListPurchaseOrdersInputSchema = z.object({
	storeId: z.uuid(),
	status: z.enum(PurchaseOrderStatus).optional(),
	page: z.number().int().min(1).default(1),
	limit: z.number().int().min(1).max(100).default(20),
	search: z.string().optional(),
})

// ---------------------------------------------------------------------------
// Output — paginated list of purchase order rows for the /app/procurement screen.
// ---------------------------------------------------------------------------
export const PurchaseOrderItemSchema = z.object({
	id: z.uuid(),
	storeId: z.uuid(),
	supplierName: z.string(),
	status: z.enum(PurchaseOrderStatus),
	totalAmountCents: z.number().int(),
	totalAmountCurrency: z.enum(CurrencyCode),
	createdAt: z.iso.datetime({ offset: true }),
})

export const ListPurchaseOrdersOutputSchema = z.paginatedResponse(PurchaseOrderItemSchema.shape)

/**
 * `ListPurchaseOrders` — paginated purchase orders table read for the /app/procurement screen.
 * Filter by status or free-text search on supplier name.
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
		if (input.search) filters.push(ilike(purchaseOrders.supplierName, `%${input.search}%`))
		const where = and(...filters)

		const [{ value: total } = { value: 0 }] = await this.db
			.select({ value: count() })
			.from(purchaseOrders)
			.where(where)

		const rows = await this.db
			.select({
				id: purchaseOrders.id,
				storeId: purchaseOrders.storeId,
				supplierName: purchaseOrders.supplierName,
				status: purchaseOrders.status,
				totalAmountCents: purchaseOrders.totalAmountCents,
				totalAmountCurrency: purchaseOrders.totalAmountCurrency,
				createdAt: purchaseOrders.createdAt,
			})
			.from(purchaseOrders)
			.where(where)
			.orderBy(desc(purchaseOrders.createdAt))
			.limit(input.limit)
			.offset((input.page - 1) * input.limit)

		const items = rows.map(row => ({
			id: row.id,
			storeId: row.storeId,
			supplierName: row.supplierName,
			status: row.status as PurchaseOrderStatus,
			totalAmountCents: Number(row.totalAmountCents),
			totalAmountCurrency: row.totalAmountCurrency as CurrencyCode,
			createdAt: row.createdAt.toISOString(),
		}))

		return { items, total, totalPages: Math.ceil(total / input.limit) }
	}
}
