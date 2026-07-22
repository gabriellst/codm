import type Z from 'zod'
import { BaseError, z } from '@template/core-typescript'
import { CurrencyCode } from '@template/contracts-typescript/wire/enums'
import type { Language } from '@template/contracts-typescript/wire/enums'

import type { PaymentInstrument } from '../../objects/PaymentInstrument'
import type { InterfaceErrors } from '../../errors'
import { BillingPlatform, CheckoutIntent, DeclineReason, PaymentMethodType } from '@template/contracts-typescript/wire/enums'

// `reason` is the raw gateway message (diagnostics/operators); `declineCode` is the structured,
// localizable classification — set when the provider can map its signal, absent otherwise.
//
// `pending` distinguishes a still-SETTLING success from a SETTLED one: `pending: true` means the
// gateway ACCEPTED the charge but settlement is async/unconfirmed — the authoritative paid/failed
// outcome lands later via webhook. Absent/false means the charge SETTLED synchronously (captured).
// Callers must NOT treat a `pending` success as PAID: SubscriptionCharger records it as a PENDING
// Charge (never SUCCEEDED) so the invoice does not DERIVE as PAID before real settlement.
export type ChargeResult = { ok: true; gatewayTxId: string; pending?: boolean } | { ok: false; reason: string; declineCode?: DeclineReason }

// The real settlement status of a charge/order at the gateway, resolved by `getChargeStatus` —
// used by the reconciliation sweep to close out a stale PENDING charge whose settlement webhook
// was dropped. `settled` = at least one captured charge; `failed` = terminal, never captured;
// `pending` = still in flight (or the gateway's status is unrecognized — never assume terminal).
export type ChargeSettlementStatus = 'settled' | 'failed' | 'pending'

// How much of this gateway tx has effectively been refunded — resolved by getRefundStatus, used by
// RefundReconcileJob to close refund expectations whose confirmation webhook was dropped.
// `refundedTotalCents` is the accumulated TOTAL (the delta vs Σ credit notes is the caller's job);
// `refunds` lists each confirmed refund with its CANONICAL id (the same the real webhook would
// use), oldest to newest.
export interface RefundStatus {
	refundedTotalCents: number
	refunds: { gatewayRef: string; amountCents: number }[]
}

// Whether the gateway flags the tx as charged-back — resolved by getChargebackStatus, used by
// ChargebackReconcileJob to detect a dispute whose webhook was dropped. Boolean on purpose: no new
// money parse here — the amount shown in the alert comes from OUR charge row's `amountCents`, never
// a total read off the gateway.
//
// `disputeRefs` (optional): the gateway's dispute ids for this tx, when the platform enumerates
// disputes BY IDENTITY — includes resolved disputes (won/lost), not just the open one, because the
// detector does a set-difference against what the ledger already knows
// (DisputeRepository.listRefsByInvoiceId), not a current-state read. ABSENT ⇔ the platform only
// exposes the boolean `chargedBack` with no identity — the detector degrades to the boolean regime.
// Present and EMPTY ⇔ the platform enumerates but found no dispute for this tx (≡ `chargedBack: false`).
export interface ChargebackStatus {
	chargedBack: boolean
	disputeRefs?: string[]
}

// The real state of a hosted-checkout session at the gateway, resolved by
// `getCheckoutSessionStatus` — used by the CheckoutSessionReconciler (alarm + sweep) to close out
// a stale PENDING CheckoutSession whose completion webhook was dropped. `paid` mirrors ONLY the
// fields `ExternalCheckoutCompletedEvent` needs beyond what the reconciler already knows from the
// persisted CheckoutSession — everything the GET surface cannot supply stays absent, never invented.
export type CheckoutSessionState = 'paid' | 'open' | 'expired'

export interface CheckoutSessionStatusResult {
	state: CheckoutSessionState
	paid?: {
		gatewayTxId?: string
		instrument?: PaymentInstrument
		amountCents?: number
	}
}

// The minted hosted-checkout session. `url` is where the customer is redirected; `sessionRef` is
// the gateway session id — the webhook's dedup/join key. URLs are minted on-demand and NEVER
// persisted (sessions expire — `expiresAt` lets the caller inform the UI).
export interface CheckoutSessionResult {
	url: string
	sessionRef: string
	expiresAt?: Date
}

/** Billing-owned customer identity handed to gateways — sourced from BillingProfile (structurally
 *  satisfied by the entity), never from any kernel port. Part of this port's call-contract surface
 *  (ensureCustomer/createCheckoutSession/createPix all take it); the `document` may carry formatting
 *  and is normalized by `PaymentProvider.buildCustomer`. */
export interface BillingCustomerIdentity {
	name: string
	email: string
	document?: string | null
	language?: Language | null
}

/**
 * Per-call gateway credentials. Absent → the PLATFORM account (env keys via Config). Passing them
 * makes the same provider operate on a DIFFERENT gateway account — the port is a generic payment
 * capability, not a plan-billing appliance. Both supported gateways authenticate with a single
 * secret key.
 */
export interface ProviderCredentials {
	apiKey: string
}

/**
 * How the hosted checkout presents WHAT is being paid (line-item title/description/image). Absent
 * fields fall back to the generic invoice presentation, so plan-billing callers keep today's
 * behavior while other callers can brand their checkout.
 */
export interface CheckoutPresentation {
	title?: string
	description?: string
	imageUrl?: string
}

// ─── Named param shapes (single source — the impls reuse these instead of re-declaring) ───

export interface EnsureCustomerParams {
	ownerId: string
	owner: BillingCustomerIdentity
	credentials?: ProviderCredentials
}

export interface CreateCheckoutSessionParams {
	ownerId: string
	owner?: BillingCustomerIdentity
	intent: CheckoutIntent
	engineInvoiceId?: string
	amountCents?: number
	/** Charge currency — defaults to the ledger currency. */
	currency?: CurrencyCode
	presentation?: CheckoutPresentation
	successUrl: string
	cancelUrl: string
	idemKey: string
	credentials?: ProviderCredentials
}

export interface ChargeOffSessionParams {
	pmRef: string
	amountCents: number
	currency?: CurrencyCode
	idemKey: string
	originGatewayTxId?: string
	code?: string
	credentials?: ProviderCredentials
}

export interface ChargeStoredOnSessionParams {
	pmRef: string
	ownerId: string
	amountCents: number
	currency?: CurrencyCode
	engineInvoiceId: string
	idemKey: string
	credentials?: ProviderCredentials
}

export interface CancelChargeParams {
	gatewayTxId: string
	amountCents?: number
	idemKey: string
	credentials?: ProviderCredentials
}

export interface CreatePixParams {
	externalReference: string
	amountCents: number
	currency?: CurrencyCode
	idemKey: string
	// The payer whose document (CPF/CNPJ) travels on the Pix charge — Pix settlement commonly
	// requires it. Optional: absent when the owner record carries no document. Raw identity;
	// the impl normalizes it via `buildCustomer`.
	payer?: BillingCustomerIdentity
	credentials?: ProviderCredentials
}

// The identity the GATEWAY needs to hold a customer record. `document` is digits-only CPF (11) /
// CNPJ (14); `type` defaults per document length when omitted (11 → individual, 14 → company).
export const GatewayCustomerSchema = z.object({
	name: z.string().min(1),
	email: z.string().min(1),
	document: z
		.string()
		.regex(/^\d{11}$|^\d{14}$/)
		.optional(),
	type: z.enum(['individual', 'company']).optional(),
})
export type GatewayCustomer = Z.infer<typeof GatewayCustomerSchema>

/**
 * MECHANISM traits — HOW a gateway operates, not which rails it speaks. CHECKOUT-ONLY providers
 * (hostedCardCheckout without cardVaulting) settle + activate via the hosted page but never vault:
 * renewals degrade to the manual-pay flow. Which payment methods a provider accepts is a SEPARATE
 * axis (`supportedMethods`) — a method the provider doesn't speak throws
 * PROVIDER_CAPABILITY_UNSUPPORTED.
 */
export interface ProviderCapabilities {
	hostedCardCheckout: boolean
	cardVaulting: boolean
}

export abstract class PaymentProvider {
	abstract readonly platform: BillingPlatform
	/** MECHANISM — how the provider operates (hosted checkout, card vaulting for MIT). */
	abstract readonly capabilities: ProviderCapabilities
	/** RAILS — which payment methods the provider speaks, keyed by the PaymentMethodType enum. */
	abstract readonly supportedMethods: ReadonlySet<PaymentMethodType>

	/**
	 * Normalize raw owner identity into the gateway customer shape — digits-only document, `type`
	 * derived from its length, dropped entirely when it isn't a CPF/CNPJ. Concrete on the abstraction
	 * so every provider builds its customer identically; impls call it inside `ensureCustomer`/`createPix`.
	 */
	protected buildCustomer(owner: BillingCustomerIdentity): GatewayCustomer {
		const digits = owner.document?.replace(/\D/g, '')
		const document = digits && (digits.length === 11 || digits.length === 14) ? digits : undefined
		return GatewayCustomerSchema.parse({
			name: owner.name,
			email: owner.email,
			...(document ? { document, type: document.length === 14 ? 'company' : 'individual' } : {}),
		})
	}

	// Upsert the GATEWAY customer record (keyed by ownerId) before the first vault/charge. Idempotent
	// (upsert-by-code); best-effort at the call site — a missing owner record must not block a
	// payment, because the card token still carries its own holder_document.
	abstract ensureCustomer(p: EnsureCustomerParams): Promise<void>

	// Hosted-checkout capture: mint a gateway-hosted session the customer is redirected to. intent
	// 'payment' pays `engineInvoiceId` AND vaults the card in the same session; intent 'setup' only
	// vaults. Vaulting happens via webhook (checkout.session.completed → ExternalCheckoutCompletedEvent),
	// never via a frontend token. idemKey: a retried mint must not create a second live session.
	abstract createCheckoutSession(p: CreateCheckoutSessionParams): Promise<CheckoutSessionResult>

	// any off-session-capable pmRef
	abstract chargeOffSession(p: ChargeOffSessionParams): Promise<ChargeResult>

	// CIT on a STORED credential: the first charge of the series against an already-vaulted pmRef.
	abstract chargeStoredOnSession(p: ChargeStoredOnSessionParams): Promise<ChargeResult>

	// idemKey: refunds are operator-triggered and may be retried — key it so a repeat cancel doesn't
	// double-refund the gateway charge.
	abstract cancelCharge(p: CancelChargeParams): Promise<void>

	// one-off rail → the PIX PaymentSession variant. idemKey: keyed so a retried/replayed create
	// doesn't mint a second Pix charge for the same invoice.
	abstract createPix(p: CreatePixParams): Promise<{ pixId: string; qr: string; copyPaste: string; expiresAt: Date }>

	/**
	 * The real settlement status of a charge/order at the gateway — used by the reconciliation sweep
	 * to resolve a stale PENDING charge whose settlement webhook was dropped. Default-throws
	 * PROVIDER_CAPABILITY_UNSUPPORTED: a provider that never leaves a PENDING charge behind never
	 * overrides it (D8 capability-default).
	 */
	async getChargeStatus(_gatewayTxId: string): Promise<ChargeSettlementStatus> {
		throw new BaseError<InterfaceErrors>('PROVIDER_CAPABILITY_UNSUPPORTED')
	}

	/** The real refund state of a tx — getChargeStatus mold: concrete with a capability-unsupported
	 *  default. Providers without an override stay webhook-only (the expectation only alerts at max-age). */
	async getRefundStatus(_gatewayTxId: string): Promise<RefundStatus> {
		throw new BaseError<InterfaceErrors>('PROVIDER_CAPABILITY_UNSUPPORTED')
	}

	/** The real dispute/chargeback state of a tx — getRefundStatus mold: concrete with a
	 *  capability-unsupported default. Providers without an override stay webhook-only. */
	async getChargebackStatus(_gatewayTxId: string): Promise<ChargebackStatus> {
		throw new BaseError<InterfaceErrors>('PROVIDER_CAPABILITY_UNSUPPORTED')
	}

	/** The real status of a hosted-checkout session — getChargeStatus/getRefundStatus mold: concrete
	 *  with a capability-unsupported default. Used by the CheckoutSessionReconciler to resolve a
	 *  PENDING CheckoutSession whose completion webhook was lost. */
	async getCheckoutSessionStatus(_sessionRef: string): Promise<CheckoutSessionStatusResult> {
		throw new BaseError<InterfaceErrors>('PROVIDER_CAPABILITY_UNSUPPORTED')
	}
}
