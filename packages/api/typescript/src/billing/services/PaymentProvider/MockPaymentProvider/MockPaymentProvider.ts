import { injectable } from 'tsyringe-neo'
import { BillingPlatform, PaymentMethodType } from '@template/contracts-typescript/wire/enums'

import {
	PaymentProvider,
	type ChargeResult,
	type ChargeSettlementStatus,
	type RefundStatus,
	type ChargebackStatus,
	type CheckoutSessionResult,
	type CheckoutSessionStatusResult,
	type GatewayCustomer,
	type EnsureCustomerParams,
	type CreateCheckoutSessionParams,
	type ChargeOffSessionParams,
	type ChargeStoredOnSessionParams,
	type CancelChargeParams,
	type CreatePixParams,
} from '../PaymentProvider'

/**
 * Deterministic in-memory provider for tests. No network. Records full call params (including the
 * parameterized currency/presentation/credentials) so tests can assert what a gateway would see.
 */
@injectable()
export class MockPaymentProvider extends PaymentProvider {
	readonly platform = BillingPlatform.PAGARME
	// Mutable in the test double (the port declares these readonly) so a suite can exercise
	// mechanism- and method-gated paths without a second provider class: capabilities toggles
	// hosted-checkout/vaulting; supportedMethods.delete/add(PIX) toggles Pix support.
	capabilities = { hostedCardCheckout: true, cardVaulting: true }
	supportedMethods = new Set([PaymentMethodType.CARD, PaymentMethodType.PIX])
	pixCalls: (Omit<CreatePixParams, 'payer'> & { customer?: GatewayCustomer })[] = []
	offSessionCharges: ChargeOffSessionParams[] = []
	storedOnSessionCharges: ChargeStoredOnSessionParams[] = []
	canceledCharges: CancelChargeParams[] = []
	/** Flat gatewayTxId capture for cancelCharge — test-observability convenience over canceledCharges. */
	refunds: string[] = []
	ensureCustomerCalls: { ownerId: string; customer: GatewayCustomer }[] = []
	checkoutSessions: CreateCheckoutSessionParams[] = []

	/** Test helper: when set, the next chargeStoredOnSession/chargeOffSession call is declined with this reason instead of succeeding. Consumed on use. */
	private declineReason: string | undefined

	/** Test helper: when set, the next charge returns an accepted-but-unsettled `{ ok:true, pending:true }` (async-settlement gateway). Consumed on use. */
	private pendingNext = false

	/** Test helper: per-gatewayTxId settlement status returned by getChargeStatus — drives the reconciler tests without a real gateway. */
	private chargeStatuses = new Map<string, ChargeSettlementStatus>()

	/** Test helper: per-gatewayTxId refund status returned by getRefundStatus — drives the refund reconciliation sweep tests without a real gateway. */
	private refundStatuses = new Map<string, RefundStatus>()

	/** Test helper: per-gatewayTxId chargeback status returned by getChargebackStatus — drives the chargeback reconciliation sweep tests without a real gateway. */
	private chargebackStatuses = new Map<string, ChargebackStatus>()

	/** Test helper: per-sessionRef status returned by getCheckoutSessionStatus — drives the CheckoutSessionReconciler tests without a real gateway. */
	private checkoutSessionStatuses = new Map<string, CheckoutSessionStatusResult>()

	/** Test helper: when set, the next cancelCharge throws instead of succeeding — exercises the dup-refund swallow path (a gateway rejecting cancel of an unknown/failed charge). Consumed on use. */
	private failNextRefundError: Error | undefined

	/** Test helper: arm a decline for the next charge call — matches a gateway synchronous decline (e.g. `insufficient_funds`). */
	declineNextCharge(reason: string): void {
		this.declineReason = reason
	}

	/** Test helper: arm a pending (accepted-but-unsettled) outcome for the next charge — matches Pagar.me mapping a 'pending'/'processing' order to `{ ok:true, pending:true }`. */
	pendingNextCharge(): void {
		this.pendingNext = true
	}

	/** Test helper: set what getChargeStatus(gatewayTxId) returns — drives the reconciliation sweep in tests without a real gateway. */
	setChargeStatus(gatewayTxId: string, status: ChargeSettlementStatus): void {
		this.chargeStatuses.set(gatewayTxId, status)
	}

	/** Test helper: set what getRefundStatus(gatewayTxId) returns — drives the refund reconciliation sweep in tests without a real gateway. */
	setRefundStatus(gatewayTxId: string, status: RefundStatus): void {
		this.refundStatuses.set(gatewayTxId, status)
	}

	/** Test helper: set what getChargebackStatus(gatewayTxId) returns — drives the chargeback reconciliation sweep in tests without a real gateway. */
	setChargebackStatus(gatewayTxId: string, status: ChargebackStatus): void {
		this.chargebackStatuses.set(gatewayTxId, status)
	}

	/** Test helper: set what getCheckoutSessionStatus(sessionRef) returns — drives the CheckoutSessionReconciler in tests without a real gateway. */
	setCheckoutSessionStatus(sessionRef: string, status: CheckoutSessionStatusResult): void {
		this.checkoutSessionStatuses.set(sessionRef, status)
	}

	/** Test helper: arm the next cancelCharge to throw (e.g. the gateway rejecting a cancel of an unknown/failed charge) — exercises the dup-refund swallow path. */
	failNextRefund(message = 'gateway: cannot cancel unknown or failed charge'): void {
		this.failNextRefundError = new Error(message)
	}

	override async getChargeStatus(gatewayTxId: string): Promise<ChargeSettlementStatus> {
		return this.chargeStatuses.get(gatewayTxId) ?? 'pending'
	}

	override async getRefundStatus(gatewayTxId: string): Promise<RefundStatus> {
		return this.refundStatuses.get(gatewayTxId) ?? { refundedTotalCents: 0, refunds: [] }
	}

	override async getChargebackStatus(gatewayTxId: string): Promise<ChargebackStatus> {
		return this.chargebackStatuses.get(gatewayTxId) ?? { chargedBack: false }
	}

	override async getCheckoutSessionStatus(sessionRef: string): Promise<CheckoutSessionStatusResult> {
		return this.checkoutSessionStatuses.get(sessionRef) ?? { state: 'open' }
	}

	async ensureCustomer(p: EnsureCustomerParams): Promise<void> {
		// Record the NORMALIZED customer (via the shared buildCustomer) so tests assert what the
		// gateway would actually receive.
		this.ensureCustomerCalls.push({ ownerId: p.ownerId, customer: this.buildCustomer(p.owner) })
	}

	async createCheckoutSession(p: CreateCheckoutSessionParams): Promise<CheckoutSessionResult> {
		this.checkoutSessions.push(p)
		return {
			url: `https://checkout.mock/${p.intent}/${p.idemKey}`,
			sessionRef: `cs_mock_${p.idemKey}`,
			expiresAt: new Date(Date.now() + 30 * 60 * 1000),
		}
	}

	async chargeOffSession(p: ChargeOffSessionParams): Promise<ChargeResult> {
		this.offSessionCharges.push(p)
		return this.chargeOutcome(p.idemKey)
	}

	// CIT on a stored credential: first charge of the series on an already-vaulted pmRef.
	async chargeStoredOnSession(p: ChargeStoredOnSessionParams): Promise<ChargeResult> {
		this.storedOnSessionCharges.push(p)
		return this.chargeOutcome(p.idemKey)
	}

	private chargeOutcome(idemKey: string): ChargeResult {
		if (this.declineReason) {
			const reason = this.declineReason
			this.declineReason = undefined
			return { ok: false, reason }
		}
		if (this.pendingNext) {
			this.pendingNext = false
			return { ok: true, gatewayTxId: `gw_${idemKey}`, pending: true }
		}
		return { ok: true, gatewayTxId: `gw_${idemKey}` }
	}

	async cancelCharge(p: CancelChargeParams): Promise<void> {
		if (this.failNextRefundError) {
			const err = this.failNextRefundError
			this.failNextRefundError = undefined
			throw err
		}
		this.canceledCharges.push(p)
		this.refunds.push(p.gatewayTxId)
	}

	async createPix(p: CreatePixParams): Promise<{ pixId: string; qr: string; copyPaste: string; expiresAt: Date }> {
		const { payer, ...rest } = p
		this.pixCalls.push({ ...rest, customer: payer ? this.buildCustomer(payer) : undefined })
		return {
			pixId: `pix_${p.externalReference}`,
			qr: 'data:image/png;base64,mock',
			copyPaste: '00020126mockbrcode',
			expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
		}
	}
}
