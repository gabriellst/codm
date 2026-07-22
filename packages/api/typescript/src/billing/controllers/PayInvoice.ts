import { z } from '@template/core-typescript'
import { Controller } from '@template/core-typescript'
import { HttpStatusCode } from '@template/core-typescript'
import { injectable } from 'tsyringe-neo'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireOwner } from '@owner/middlewares'
import { PayInvoice } from '@billing/usecases'
import { PayInvoicePaymentSchema, PayInvoiceResponseSchema } from '@billing/services'
import { PaymentMethodType } from '@template/contracts-typescript/wire/enums'

export const PayInvoiceControllerInput = z
	.object({
		params: z.object({
			engineInvoiceId: z.string(),
		}),
		// The body IS the payment union leaf — { method: CARD, paymentMethodId? } | { method: PIX }.
		body: PayInvoicePaymentSchema,
		ctx: z.object({
			session: z.object({
				ownerId: z.string(),
			}),
		}),
	})
	.example([
		{
			params: { engineInvoiceId: 'inv_1' },
			body: { method: PaymentMethodType.CARD },
			ctx: { session: { ownerId: 'owner-uuid' } },
		},
		{
			params: { engineInvoiceId: 'inv_1' },
			body: { method: PaymentMethodType.PIX },
			ctx: { session: { ownerId: 'owner-uuid' } },
		},
	])

export const PayInvoiceControllerOutput = PayInvoiceResponseSchema.meta({
	examples: [
		{ method: PaymentMethodType.CARD, ok: true, gatewayTxId: 'gw_inv_1' },
		{
			method: PaymentMethodType.PIX,
			pixId: 'pix_inv_1',
			qr: 'data:image/png;base64,...',
			copyPaste: '00020126brcode',
			expiresAt: new Date('2026-07-03T12:00:00.000Z'),
		},
	],
})

@injectable()
export class PayInvoiceController extends Controller<typeof PayInvoiceControllerInput, typeof PayInvoiceControllerOutput> {
	readonly path = '/invoices/:engineInvoiceId/pay'
	readonly method = 'post'
	readonly description = 'Pay an invoice with a method-discriminated payment: stored card (CIT/MIT) or a one-off Pix artifact'
	readonly inputSchema = PayInvoiceControllerInput
	readonly outputSchema = PayInvoiceControllerOutput

	override middlewares = [AuthAccountMiddleware, RequireOwner]

	constructor(private payInvoice: PayInvoice) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.payInvoice.execute({
			ownerId: request.ctx.session.ownerId,
			engineInvoiceId: request.params.engineInvoiceId,
			payment: request.body,
		})

		return {
			status: HttpStatusCode.OK,
			data,
		}
	}
}
