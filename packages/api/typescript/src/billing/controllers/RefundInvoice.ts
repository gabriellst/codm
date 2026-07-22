import { z } from '@template/core-typescript'
import { Controller } from '@template/core-typescript'
import { HttpStatusCode } from '@template/core-typescript'
import { injectable } from 'tsyringe-neo'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireOwner } from '@owner/middlewares'
import { RefundInvoice } from '@billing/usecases'

export const RefundInvoiceControllerInput = z
	.object({
		params: z.object({
			engineInvoiceId: z.string(),
		}),
		body: z.object({
			amountCents: z.number().int().positive().optional(),
		}),
		ctx: z.object({
			session: z.object({
				ownerId: z.string(),
			}),
		}),
	})
	.example([
		{
			params: { engineInvoiceId: 'inv_1' },
			body: {},
			ctx: { session: { ownerId: 'owner-uuid' } },
		},
	])

export const RefundInvoiceControllerOutput = z.object({ ok: z.boolean() }).example([{ ok: true }])

@injectable()
export class RefundInvoiceController extends Controller<typeof RefundInvoiceControllerInput, typeof RefundInvoiceControllerOutput> {
	readonly path = '/invoices/:engineInvoiceId/refund'
	readonly method = 'post'
	readonly description = 'Refund a settled invoice (operator): cancels the gateway charge and moves the invoice to REFUNDED'
	readonly inputSchema = RefundInvoiceControllerInput
	readonly outputSchema = RefundInvoiceControllerOutput

	override middlewares = [AuthAccountMiddleware, RequireOwner]

	constructor(private refundInvoice: RefundInvoice) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.refundInvoice.execute({
			ownerId: request.ctx.session.ownerId,
			engineInvoiceId: request.params.engineInvoiceId,
			amountCents: request.body.amountCents,
		})

		return {
			status: HttpStatusCode.OK,
			data,
		}
	}
}
