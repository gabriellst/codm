import type { BillingWebhookSource } from '@billing/enums'

/**
 * One verifier per source. Receives the whole inbound `Request` and decides
 * whether it is authentic — each source knows where its own signature lives
 * (header / query) and reads it WITHOUT consuming the body, so the mapper can
 * still read the body afterwards. Resolved per source by BillingWebhookVerifierFactory.
 */
export abstract class BillingWebhookVerifier {
	abstract readonly source: BillingWebhookSource
	abstract verify(request: Request): Promise<boolean>
}
