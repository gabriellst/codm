import { z } from '@template/core-typescript'
import { Controller } from '@template/core-typescript'
import { HttpStatusCode } from '@template/core-typescript'
import { injectable } from 'tsyringe-neo'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { BillingWebhookSource } from '@billing/enums'
import { HandleBillingWebhook } from '@billing/usecases'

export const HandleBillingWebhookControllerInput = z
	.object({
		// Case-insensitive: webhook senders address the endpoint in lowercase (Stripe CLI
		// `--forward-to …/webhooks/stripe`, Pagar.me `…/webhooks/pagarme`, the sandbox
		// provider), but BillingWebhookSource is uppercase. Uppercase then pipe into the
		// enum so `/webhooks/stripe` and `/webhooks/STRIPE` both route (and bogus sources still 400) — a
		// lowercase source was 400ing before the verifier ever ran, silently dropping every webhook.
		params: z.object({ source: z.string().toUpperCase().pipe(z.enum(BillingWebhookSource)) }),
		body: z.record(z.string(), z.unknown()),
	})
	.example([
		{
			params: { source: BillingWebhookSource.PAGARME },
			body: { id: 'hook_1', type: 'charge.paid', data: { id: 'ch_1', code: 'inv_1', amount: 29900 } },
		},
	])

export const HandleBillingWebhookControllerOutput = z.object({ accepted: z.number().int().nonnegative() }).example([{ accepted: 1 }])

/**
 * The single billing-webhook endpoint. Path-param `source` (PAGARME | STRIPE) routes
 * to the verifier + mapper via their factories. Public — the provider authenticates
 * via its own signature, verified inside the usecase.
 */
@injectable()
export class HandleBillingWebhookController extends Controller<
	typeof HandleBillingWebhookControllerInput,
	typeof HandleBillingWebhookControllerOutput
> {
	readonly path = '/webhooks/:source'
	readonly method = 'post'
	readonly description = 'Ingest a billing webhook from the payment gateway; :source routes to the verifier + mapper.'
	readonly inputSchema = HandleBillingWebhookControllerInput
	readonly outputSchema = HandleBillingWebhookControllerOutput

	override skipMiddlewares = [AuthAccountMiddleware]

	constructor(private handleBillingWebhook: HandleBillingWebhook) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.handleBillingWebhook.execute({ source: request.params.source, request: request.raw })
		return { status: HttpStatusCode.ACCEPTED, data }
	}
}
