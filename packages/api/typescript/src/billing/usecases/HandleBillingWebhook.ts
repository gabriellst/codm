import { Handler } from '@template/core-typescript'
import { BaseError } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { z } from '@template/core-typescript'
import { injectable } from 'tsyringe-neo'
import { BillingWebhookSource } from '@billing/enums'
import { BillingWebhookVerifierFactory, BillingWebhookMapperFactory, BillingEventIngest } from '@billing/services'
import type { InterfaceErrors } from '@billing/errors'

export const HandleBillingWebhookInputSchema = z.object({
	source: z.enum(BillingWebhookSource),
	request: z.instanceof(Request),
})

export const HandleBillingWebhookOutputSchema = z.object({
	accepted: z.number().int().nonnegative(),
})

/**
 * The single billing-webhook entry point. `source` routes to the right verifier +
 * mapper via their factories; the verifier authenticates the raw request, the
 * mapper turns the vendor body into External-prefixed events, and BillingEventIngest
 * (shared with the window-reconciliation sweep) dedupes + saves each first-seen event
 * to the outbox.
 */
@injectable()
export class HandleBillingWebhook extends Handler<typeof HandleBillingWebhookInputSchema, typeof HandleBillingWebhookOutputSchema> {
	readonly name = 'handle_billing_webhook' as const
	readonly inputSchema = HandleBillingWebhookInputSchema
	readonly outputSchema = HandleBillingWebhookOutputSchema

	constructor(
		private verifierFactory: BillingWebhookVerifierFactory,
		private mapperFactory: BillingWebhookMapperFactory,
		private ingest: BillingEventIngest,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const { source, request } = input

		const verifier = this.verifierFactory.get(source)
		const mapper = this.mapperFactory.get(source)
		if (!verifier || !mapper) {
			throw new BaseError<InterfaceErrors>('WEBHOOK_SOURCE_UNKNOWN')
		}

		// Verifiers read signature off headers/query only (never the body), so the
		// mapper can still read the body afterwards.
		if (!(await verifier.verify(request))) {
			throw new BaseError<InterfaceErrors>('WEBHOOK_SIGNATURE_INVALID')
		}

		const events = await mapper.map(request)

		return { accepted: await this.ingest.ingest(source, events, tx) }
	}
}
