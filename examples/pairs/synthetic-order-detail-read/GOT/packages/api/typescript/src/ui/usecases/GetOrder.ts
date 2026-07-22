// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-order-detail-read
// task:        synthetic-order-detail-read
// stamp:       agent-wave1-38ff876
// docTreeHash: c7182ff522b7
// model:       default
// graded:      2026-07-21T18:31:33.664Z
// source:      packages/api/typescript/src/ui/usecases/GetOrder.ts (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
import { injectable } from 'tsyringe-neo'
import { and, eq } from 'drizzle-orm'
import { BaseError, DrizzleClient, Handler, z } from '@template/core-typescript'
import { CurrencyCode, OrderStatus } from '@template/contracts-typescript/wire/enums'
import { orders } from '@template/contracts/db'

import type { ApplicationErrors } from '../errors'

export const GetOrderInputSchema = z.object({
	ownerId: z.string().min(1),
	orderId: z.string().min(1),
})

export const GetOrderOutputSchema = z.object({
	id: z.string(),
	status: z.enum(OrderStatus),
	totalCents: z.number().int(),
	currency: z.enum(CurrencyCode),
	createdAt: z.date(),
})

/**
 * `GetOrder` — single-order detail read for the app's order page. Owner-scoped: the id lookup is
 * ANDed with the caller's ownerId, so a foreign order is indistinguishable from a missing one
 * (both signal ORDER_NOT_FOUND — no existence leak across tenants).
 */
@injectable()
export class GetOrder extends Handler<typeof GetOrderInputSchema, typeof GetOrderOutputSchema> {
	readonly name = 'get_order' as const
	readonly inputSchema = GetOrderInputSchema
	readonly outputSchema = GetOrderOutputSchema

	constructor(private db: DrizzleClient) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const [row] = await this.db
			.select({
				id: orders.id,
				status: orders.status,
				totalCents: orders.totalCents,
				currency: orders.currency,
				createdAt: orders.createdAt,
			})
			.from(orders)
			.where(and(eq(orders.id, input.orderId), eq(orders.ownerId, input.ownerId)))

		if (!row) throw new BaseError<ApplicationErrors>('ORDER_NOT_FOUND')

		return row
	}
}
