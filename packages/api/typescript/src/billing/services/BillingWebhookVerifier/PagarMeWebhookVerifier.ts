import { injectable } from 'tsyringe-neo'
import { ProductConfig } from '@shared/config'
import { BillingWebhookSource } from '@billing/enums'
import { BillingWebhookVerifier } from './BillingWebhookVerifier'

@injectable()
export class PagarMeWebhookVerifier extends BillingWebhookVerifier {
	readonly source = BillingWebhookSource.PAGARME

	// Pagar.me webhooks authenticate via Basic auth (no HMAC) — compare credentials.
	// Header-only: does not consume the request body.
	async verify(request: Request): Promise<boolean> {
		if (!ProductConfig.env.PAGARME_WEBHOOK_USER || !ProductConfig.env.PAGARME_WEBHOOK_PASSWORD) return false
		const auth = request.headers.get('authorization') ?? ''
		const expected = `Basic ${Buffer.from(`${ProductConfig.env.PAGARME_WEBHOOK_USER}:${ProductConfig.env.PAGARME_WEBHOOK_PASSWORD}`).toString('base64')}`
		if (auth.length !== expected.length) return false
		let mismatch = 0
		for (let i = 0; i < auth.length; i++) mismatch |= auth.charCodeAt(i) ^ expected.charCodeAt(i)
		return mismatch === 0
	}
}
