import Stripe from 'stripe'
import { injectable } from 'tsyringe-neo'
import { ProductConfig } from '@shared/config'
import { BillingWebhookSource } from '@billing/enums'
import { BillingWebhookVerifier } from './BillingWebhookVerifier'

@injectable()
export class StripeWebhookVerifier extends BillingWebhookVerifier {
	readonly source = BillingWebhookSource.STRIPE

	private client: Stripe | undefined

	// Lazily construct the SDK (see StripePaymentProvider) — only `webhooks.constructEvent` is used,
	// which needs no API key, but the client is the SDK's entry point for it. Overridable for tests.
	protected stripe(): Stripe {
		if (!this.client) this.client = new Stripe(ProductConfig.env.STRIPE_API_KEY)
		return this.client
	}

	// Stripe signs deliveries with an HMAC in the `Stripe-Signature` header over the RAW body.
	// constructEvent re-derives it from STRIPE_WEBHOOK_SECRET and throws on mismatch. Read the raw
	// bytes off a CLONE so the mapper can still read the body afterwards. Fails CLOSED: any missing
	// secret/signature or verification throw returns false.
	async verify(request: Request): Promise<boolean> {
		if (!ProductConfig.env.STRIPE_WEBHOOK_SECRET) return false
		const signature = request.headers.get('stripe-signature')
		if (!signature) return false
		try {
			const rawBody = await request.clone().text()
			// constructEventAsync — NOT the sync constructEvent. Bun routes Stripe's HMAC through
			// SubtleCrypto, which is async-only, so the sync path throws "SubtleCryptoProvider cannot be
			// used in a synchronous context" and every signature check silently failed (verify=false →
			// ALL Stripe webhooks rejected → charges never settled).
			await this.stripe().webhooks.constructEventAsync(rawBody, signature, ProductConfig.env.STRIPE_WEBHOOK_SECRET)
			return true
		} catch {
			return false
		}
	}
}
