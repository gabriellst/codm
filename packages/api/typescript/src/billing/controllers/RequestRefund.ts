import { z } from '@template/core-typescript'
import { Controller } from '@template/core-typescript'
import { HttpStatusCode } from '@template/core-typescript'
import { injectable } from 'tsyringe-neo'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireOwner } from '@owner/middlewares'
import { RequestRefund } from '@billing/usecases'
import { RefundBasis } from '@billing/enums/RefundBasis'

export const RequestRefundControllerInput = z
	.object({
		params: z.object({
			id: z.string(),
		}),
		ctx: z.object({
			session: z.object({
				ownerId: z.string(),
			}),
		}),
	})
	.example([
		{
			params: { id: 'inv_1' },
			ctx: { session: { ownerId: 'owner-uuid' } },
		},
	])

export const RequestRefundControllerOutput = z
	.object({
		requestedAmountCents: z.number().int().nonnegative(),
		// Shared RefundBasis enum (→ named $ref in the SDK), never an inline literal that drifts from RefundPolicy.
		basis: z.enum(RefundBasis),
	})
	.example([
		{ requestedAmountCents: 29900, basis: RefundBasis.CDC_WINDOW },
		{ requestedAmountCents: 0, basis: RefundBasis.NONE },
	])

@injectable()
export class RequestRefundController extends Controller<typeof RequestRefundControllerInput, typeof RequestRefundControllerOutput> {
	// NOTE: distinct from the operator's `POST /invoices/:engineInvoiceId/refund` (RefundInvoiceController).
	// Both would resolve to the same Fastify route node `/invoices/:*/refund` (param names don't disambiguate),
	// so the user-facing verb gets its own path to avoid a duplicate-route boot error. This usecase is fenced
	// from touching the operator controller.
	readonly path = '/invoices/:id/refund-request'
	readonly method = 'post'
	readonly description =
		'Request a refund for a settled invoice (user): computes a usage-aware refundable amount (CDC withdrawal window → full, else pro-rata of the unused period) and triggers a partial gateway refund. The credit note is issued asynchronously from the confirmed-refund webhook.'
	readonly inputSchema = RequestRefundControllerInput
	readonly outputSchema = RequestRefundControllerOutput

	override middlewares = [AuthAccountMiddleware, RequireOwner]

	constructor(private requestRefund: RequestRefund) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.requestRefund.execute({
			ownerId: request.ctx.session.ownerId,
			engineInvoiceId: request.params.id,
		})

		return {
			status: HttpStatusCode.OK,
			data,
		}
	}
}
