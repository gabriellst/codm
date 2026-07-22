import crypto from 'node:crypto'
import { injectable } from 'tsyringe-neo'
import { ProductConfig } from '@shared/config'
import { BillingWebhookSource } from '@billing/enums'
import { BillingWebhookVerifier } from './BillingWebhookVerifier'

@injectable()
export class MercadoPagoWebhookVerifier extends BillingWebhookVerifier {
	readonly source = BillingWebhookSource.MERCADOPAGO

	// MercadoPago signs deliveries with an HMAC in the `x-signature` header — `ts=<unix>,v1=<hex>` —
	// computed over a MANIFEST STRING (not the raw body, unlike Stripe/most gateways):
	//   "id:{data.id};request-id:{x-request-id};ts:{ts};"
	// `data.id` is the resource id MercadoPago appends as a query param on the notification URL
	// (`…?data.id=123456&type=payment`); `x-request-id` rides its own header; `ts` is read back out
	// of the same `x-signature` header it's verifying. Per MercadoPago's docs the id is lowercased in
	// the manifest even when the URL/body casing differs. Header/query-only: never consumes the
	// request body, so the mapper can still read it afterwards. Fails CLOSED: any missing
	// secret/header/id or mismatch returns false.
	async verify(request: Request): Promise<boolean> {
		const secret = ProductConfig.env.MERCADOPAGO_WEBHOOK_SECRET
		if (!secret) return false

		const signatureHeader = request.headers.get('x-signature')
		const requestId = request.headers.get('x-request-id')
		if (!signatureHeader || !requestId) return false

		const dataId = new URL(request.url).searchParams.get('data.id')
		if (!dataId) return false

		const parts: Record<string, string> = {}
		for (const rawPart of signatureHeader.split(',')) {
			const [key, value] = rawPart.trim().split('=', 2)
			if (key && value) parts[key] = value
		}
		const ts = parts.ts
		const v1 = parts.v1
		if (!ts || !v1) return false

		const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`
		const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex')

		if (expected.length !== v1.length) return false
		let mismatch = 0
		for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ v1.charCodeAt(i)
		return mismatch === 0
	}
}
