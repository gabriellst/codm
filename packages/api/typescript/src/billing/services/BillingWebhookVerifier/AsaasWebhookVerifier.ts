import { injectable } from 'tsyringe-neo'
import { ProductConfig } from '@shared/config'
import { BillingWebhookSource } from '@billing/enums'
import { BillingWebhookVerifier } from './BillingWebhookVerifier'

/**
 * Asaas authenticates webhook deliveries with a STATIC token in the `asaas-access-token` header
 * (configured once in the Asaas dashboard), NOT an HMAC signature over the body — unlike Stripe's
 * `Stripe-Signature` or Pagar.me's Basic auth pair. The feasibility matrix flags this as the
 * weakest verification mechanism among the viable providers (⚠️ no HMAC; Asaas' own mitigation is
 * an optional IP allowlist configured on their side, outside this codebase's control).
 *
 * Header-only: does not consume the request body (mirrors PagarMeWebhookVerifier), so the mapper
 * can still read it afterwards. Fails CLOSED: a missing configured token or a missing/mismatched
 * header both return false. Comparison is constant-time to avoid leaking the token's length/prefix
 * via timing (same posture as PagarMeWebhookVerifier's Basic-auth compare).
 */
@injectable()
export class AsaasWebhookVerifier extends BillingWebhookVerifier {
	readonly source = BillingWebhookSource.ASAAS

	async verify(request: Request): Promise<boolean> {
		const expected = ProductConfig.env.ASAAS_WEBHOOK_TOKEN
		if (!expected) return false

		const received = request.headers.get('asaas-access-token') ?? ''
		if (received.length !== expected.length) return false

		let mismatch = 0
		for (let i = 0; i < received.length; i++) mismatch |= received.charCodeAt(i) ^ expected.charCodeAt(i)
		return mismatch === 0
	}
}
