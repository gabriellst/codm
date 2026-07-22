import crypto from 'node:crypto'
import { injectable } from 'tsyringe-neo'
import { ProductConfig } from '@shared/config'
import { BillingWebhookSource } from '@billing/enums'
import { BillingWebhookVerifier } from './BillingWebhookVerifier'

@injectable()
export class PagBankWebhookVerifier extends BillingWebhookVerifier {
	readonly source = BillingWebhookSource.PAGBANK

	// PagBank signs deliveries with `x-authenticity-token` = SHA-256 hex of
	// `{PAGBANK_API_TOKEN}-{rawBody}` — the SAME token used to authenticate our own outbound
	// calls (no separate webhook secret to provision). Read the raw bytes off a CLONE so the
	// mapper can still read the body afterwards. Fails CLOSED: missing token/header or a
	// mismatch → false.
	async verify(request: Request): Promise<boolean> {
		if (!ProductConfig.env.PAGBANK_API_TOKEN) return false
		const token = request.headers.get('x-authenticity-token')
		if (!token) return false

		const rawBody = await request.clone().text()
		const expected = crypto.createHash('sha256').update(`${ProductConfig.env.PAGBANK_API_TOKEN}-${rawBody}`).digest('hex')

		// Constant-time compare (same posture as PagarMeWebhookVerifier's Basic-Auth check) — a
		// naive `===` on attacker-controlled input leaks timing information about the secret.
		if (token.length !== expected.length) return false
		let mismatch = 0
		for (let i = 0; i < token.length; i++) mismatch |= token.charCodeAt(i) ^ expected.charCodeAt(i)
		return mismatch === 0
	}
}
