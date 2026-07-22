import { describe, it, expect, beforeEach } from 'bun:test'
import Stripe from 'stripe'

import { Language } from '@template/contracts-typescript/wire/enums'
import { CaptureOrigin } from '@billing/enums/CaptureOrigin'
import { StripePaymentProvider } from './StripePaymentProvider'
import { BillingPlatform, DeclineReason, PaymentMethodType } from '@template/contracts-typescript/wire/enums'
import {
	PaymentProvider,
	type ChargeResult,
	type CheckoutSessionResult,
	type EnsureCustomerParams,
	type CreateCheckoutSessionParams,
	type ChargeOffSessionParams,
	type ChargeStoredOnSessionParams,
	type CancelChargeParams,
	type CreatePixParams,
} from '../PaymentProvider'

// Bare, un-overriding subclass — exercises the ABSTRACTION's default `getRefundStatus` (capability
// unsupported), same as every one of the 6 gateways that don't implement it (T3 scope fence).
class BareProvider extends PaymentProvider {
	readonly platform = BillingPlatform.STRIPE
	readonly capabilities = { hostedCardCheckout: false, cardVaulting: false }
	readonly supportedMethods = new Set<PaymentMethodType>()
	async ensureCustomer(_p: EnsureCustomerParams): Promise<void> {
		throw new Error('unused')
	}
	async createCheckoutSession(_p: CreateCheckoutSessionParams): Promise<CheckoutSessionResult> {
		throw new Error('unused')
	}
	async chargeOffSession(_p: ChargeOffSessionParams): Promise<ChargeResult> {
		throw new Error('unused')
	}
	async chargeStoredOnSession(_p: ChargeStoredOnSessionParams): Promise<ChargeResult> {
		throw new Error('unused')
	}
	async cancelCharge(_p: CancelChargeParams): Promise<void> {
		throw new Error('unused')
	}
	async createPix(_p: CreatePixParams): Promise<{ pixId: string; qr: string; copyPaste: string; expiresAt: Date }> {
		throw new Error('unused')
	}
}

// A minimal, hand-rolled stand-in for the Stripe SDK surface the provider touches. Each method is
// a recording stub whose return value the individual test configures. Cast to Stripe only at the
// injection seam (test-only) — the provider itself never casts Stripe responses.
class FakeStripe {
	calls: Record<string, unknown[]> = {}
	private record(name: string, args: unknown[]) {
		this.calls[name] ??= []
		this.calls[name].push(args)
	}

	customerSearchResult: { data: Array<{ id: string }> } = { data: [] }
	createdCustomer: { id: string } = { id: 'cus_new' }
	retrievedCustomer: unknown = { id: 'cus_1', metadata: { ownerId: 'o1' } }
	retrievedPaymentMethod: unknown = { id: 'pm_1', customer: 'cus_1', card: {} }
	createdSetupIntent: unknown = { id: 'seti_1', client_secret: 'seti_1_secret' }
	paymentIntentResult: unknown = { id: 'pi_1', status: 'succeeded' }
	paymentIntentError: unknown
	retrievedPaymentIntent: unknown = { id: 'pi_1', latest_charge: null }
	listedRefunds: { data: unknown[] } = { data: [] }
	retrievedCheckoutSession: unknown = { id: 'cs_1', status: 'open', mode: 'payment' }
	retrievedSetupIntent: unknown = { id: 'seti_1', payment_method: null }

	customers = {
		search: (params: unknown) => {
			this.record('customers.search', [params])
			return Promise.resolve(this.customerSearchResult)
		},
		create: (params: unknown) => {
			this.record('customers.create', [params])
			return Promise.resolve(this.createdCustomer)
		},
		update: (id: string, params: unknown) => {
			this.record('customers.update', [id, params])
			return Promise.resolve({ id })
		},
		retrieve: (id: string) => {
			this.record('customers.retrieve', [id])
			return Promise.resolve(this.retrievedCustomer)
		},
	}

	paymentMethods = {
		retrieve: (id: string) => {
			this.record('paymentMethods.retrieve', [id])
			return Promise.resolve(this.retrievedPaymentMethod)
		},
	}

	setupIntents = {
		create: (params: unknown) => {
			this.record('setupIntents.create', [params])
			return Promise.resolve(this.createdSetupIntent)
		},
		retrieve: (id: string, params?: unknown) => {
			this.record('setupIntents.retrieve', [id, params])
			return Promise.resolve(this.retrievedSetupIntent)
		},
	}

	checkout = {
		sessions: {
			retrieve: (id: string) => {
				this.record('checkout.sessions.retrieve', [id])
				return Promise.resolve(this.retrievedCheckoutSession)
			},
		},
	}

	paymentIntents = {
		create: (params: unknown, options?: unknown) => {
			this.record('paymentIntents.create', [params, options])
			if (this.paymentIntentError) return Promise.reject(this.paymentIntentError)
			return Promise.resolve(this.paymentIntentResult)
		},
		retrieve: (id: string, params?: unknown) => {
			this.record('paymentIntents.retrieve', [id, params])
			return Promise.resolve(this.retrievedPaymentIntent)
		},
	}

	refunds = {
		create: (params: unknown, options?: unknown) => {
			this.record('refunds.create', [params, options])
			return Promise.resolve({ id: 're_1' })
		},
		list: (params: unknown) => {
			this.record('refunds.list', [params])
			return Promise.resolve(this.listedRefunds)
		},
	}

	retrievedCharge: unknown = { id: 'ch_1', disputed: false }
	charges = {
		retrieve: (id: string) => {
			this.record('charges.retrieve', [id])
			return Promise.resolve(this.retrievedCharge)
		},
	}

	listedDisputes: { data: unknown[] } = { data: [] }
	disputesListError: unknown
	disputes = {
		list: (params: unknown) => {
			this.record('disputes.list', [params])
			if (this.disputesListError) return Promise.reject(this.disputesListError)
			return Promise.resolve(this.listedDisputes)
		},
	}
}

class TestableStripeProvider extends StripePaymentProvider {
	constructor(private fake: FakeStripe) {
		super()
	}
	protected override stripe(): Stripe {
		return this.fake as unknown as Stripe
	}
}

const arg = (fake: FakeStripe, name: string, callIndex = 0, argIndex = 0) =>
	(fake.calls[name]?.[callIndex] as unknown[] | undefined)?.[argIndex] as any

describe('StripePaymentProvider', () => {
	let fake: FakeStripe
	let provider: StripePaymentProvider

	beforeEach(() => {
		fake = new FakeStripe()
		provider = new TestableStripeProvider(fake)
	})

	it('exposes the STRIPE platform', () => {
		expect(provider.platform).toBe(BillingPlatform.STRIPE)
	})

	it('getRefundStatus: the base abstraction default throws PROVIDER_CAPABILITY_UNSUPPORTED for a non-overriding provider', async () => {
		const bare = new BareProvider()

		await expect(bare.getRefundStatus('pi_1')).rejects.toMatchObject({ name: 'PROVIDER_CAPABILITY_UNSUPPORTED' })
	})

	describe('ensureCustomer', () => {
		it('creates a customer keyed by ownerId metadata when none exists', async () => {
			fake.customerSearchResult = { data: [] }

			await provider.ensureCustomer({ ownerId: 'o1', owner: { name: 'Ana', email: 'ana@x.com', document: '123.456.789-09' } })

			expect(arg(fake, 'customers.search')).toEqual({ query: "metadata['ownerId']:'o1'" })
			const created = arg(fake, 'customers.create')
			expect(created.name).toBe('Ana')
			expect(created.email).toBe('ana@x.com')
			expect(created.metadata).toEqual({ ownerId: 'o1', document: '12345678909' })
			expect(fake.calls['customers.update']).toBeUndefined()
		})

		it('AC-5: the gateway customer carries name + email from the BillingProfile (no longer anonymous)', async () => {
			fake.customerSearchResult = { data: [] }

			// The identity now comes from billing's BillingProfile (name/email/document), so the
			// Stripe customer is de-anonymized — name/email travel to customers.create, not just metadata.
			await provider.ensureCustomer({
				ownerId: 'o1',
				owner: { name: 'Clínica Sol', email: 'financeiro@sol.com', document: '11144477735', language: Language.PT_BR },
			})

			const created = arg(fake, 'customers.create')
			expect(created.name).toBe('Clínica Sol')
			expect(created.email).toBe('financeiro@sol.com')
			expect(created.metadata).toEqual({ ownerId: 'o1', document: '11144477735' })
		})

		it('updates the existing customer when the search resolves one', async () => {
			fake.customerSearchResult = { data: [{ id: 'cus_existing' }] }

			await provider.ensureCustomer({ ownerId: 'o1', owner: { name: 'Ana', email: 'ana@x.com' } })

			expect(arg(fake, 'customers.update', 0, 0)).toBe('cus_existing')
			expect(arg(fake, 'customers.update', 0, 1).metadata).toEqual({ ownerId: 'o1' })
			expect(fake.calls['customers.create']).toBeUndefined()
		})
	})

	describe('chargeStoredOnSession', () => {
		it('confirms an off_session PaymentIntent with ownerId + engineInvoiceId metadata', async () => {
			fake.retrievedPaymentMethod = { id: 'pm_1', customer: 'cus_1', card: {} }
			fake.paymentIntentResult = { id: 'pi_ok', status: 'succeeded' }

			const result = await provider.chargeStoredOnSession({
				pmRef: 'pm_1',
				ownerId: 'o1',
				amountCents: 29900,
				engineInvoiceId: 'lago_inv_1',
				idemKey: 'lago_inv_1',
			})

			const [params, options] = fake.calls['paymentIntents.create']![0] as [any, any]
			expect(params).toMatchObject({
				amount: 29900,
				currency: 'brl',
				customer: 'cus_1',
				payment_method: 'pm_1',
				off_session: true,
				confirm: true,
				metadata: { engineInvoiceId: 'lago_inv_1', ownerId: 'o1' },
			})
			expect(options).toEqual({ idempotencyKey: 'lago_inv_1' })
			expect(result).toEqual({ ok: true, gatewayTxId: 'pi_ok' })
			// ownerId was passed in → no customer.retrieve needed to enrich metadata.
			expect(fake.calls['customers.retrieve']).toBeUndefined()
		})

		it('maps a non-succeeded status to a decline with the last_payment_error reason + structured code', async () => {
			fake.paymentIntentResult = {
				id: 'pi_x',
				status: 'requires_payment_method',
				last_payment_error: { message: 'Your card was declined.', code: 'card_declined', decline_code: 'insufficient_funds' },
			}

			const result = await provider.chargeStoredOnSession({
				pmRef: 'pm_1',
				ownerId: 'o1',
				amountCents: 100,
				engineInvoiceId: 'inv',
				idemKey: 'k',
			})

			// decline_code (issuer-level) wins over code ('card_declined').
			expect(result).toEqual({ ok: false, reason: 'Your card was declined.', declineCode: DeclineReason.INSUFFICIENT_FUNDS })
		})

		it('leaves declineCode undefined when the payment error carries no known code', async () => {
			fake.paymentIntentResult = {
				id: 'pi_x',
				status: 'requires_payment_method',
				last_payment_error: { message: 'Something odd.' },
			}

			const result = await provider.chargeStoredOnSession({
				pmRef: 'pm_1',
				ownerId: 'o1',
				amountCents: 100,
				engineInvoiceId: 'inv',
				idemKey: 'k',
			})

			expect(result.ok).toBe(false)
			if (!result.ok) expect(result.declineCode).toBeUndefined()
		})

		it('maps a thrown StripeCardError to a decline (generic CARD_DECLINED when codes are absent)', async () => {
			fake.paymentIntentError = new Stripe.errors.StripeCardError({ message: 'insufficient_funds', type: 'card_error' } as any)

			const result = await provider.chargeStoredOnSession({
				pmRef: 'pm_1',
				ownerId: 'o1',
				amountCents: 100,
				engineInvoiceId: 'inv',
				idemKey: 'k',
			})

			expect(result.ok).toBe(false)
			if (!result.ok) {
				expect(result.reason).toContain('insufficient_funds')
				// A StripeCardError is by definition a card decline — generic code when unclassifiable.
				expect(result.declineCode).toBe(DeclineReason.CARD_DECLINED)
			}
		})

		it('classifies a StripeCardError by its decline_code', async () => {
			fake.paymentIntentError = new Stripe.errors.StripeCardError({
				message: 'Your card has expired.',
				type: 'card_error',
				code: 'expired_card',
			} as any)

			const result = await provider.chargeStoredOnSession({
				pmRef: 'pm_1',
				ownerId: 'o1',
				amountCents: 100,
				engineInvoiceId: 'inv',
				idemKey: 'k',
			})

			expect(result.ok).toBe(false)
			if (!result.ok) expect(result.declineCode).toBe(DeclineReason.CARD_EXPIRED)
		})
	})

	describe('chargeOffSession', () => {
		it('derives customer + ownerId from the stored pm and enriches PI metadata', async () => {
			fake.retrievedPaymentMethod = { id: 'pm_1', customer: 'cus_1', card: {} }
			fake.retrievedCustomer = { id: 'cus_1', metadata: { ownerId: 'o7' } }
			fake.paymentIntentResult = { id: 'pi_off', status: 'succeeded' }

			const result = await provider.chargeOffSession({ pmRef: 'pm_1', amountCents: 500, idemKey: 'inv_2', code: 'lago_inv_2' })

			expect(arg(fake, 'customers.retrieve')).toBe('cus_1')
			const [params] = fake.calls['paymentIntents.create']![0] as [any]
			expect(params.customer).toBe('cus_1')
			expect(params.metadata).toEqual({ engineInvoiceId: 'lago_inv_2', ownerId: 'o7' })
			expect(result).toEqual({ ok: true, gatewayTxId: 'pi_off' })
		})
	})

	it('cancelCharge refunds by payment_intent with the idempotency key', async () => {
		await provider.cancelCharge({ gatewayTxId: 'pi_1', amountCents: 1000, idemKey: 'refund_1' })

		expect(arg(fake, 'refunds.create')).toEqual({ payment_intent: 'pi_1', amount: 1000 })
		expect(arg(fake, 'refunds.create', 0, 1)).toEqual({ idempotencyKey: 'refund_1' })
	})

	it('cancelCharge omits amount for a full refund', async () => {
		await provider.cancelCharge({ gatewayTxId: 'pi_2', idemKey: 'refund_2' })

		expect(arg(fake, 'refunds.create')).toEqual({ payment_intent: 'pi_2' })
	})

	describe('getRefundStatus', () => {
		it('cumulative amount_refunded from the latest charge + both CANONICAL re_… ids oldest→newest', async () => {
			fake.retrievedPaymentIntent = { id: 'pi_1', latest_charge: { id: 'ch_1', amount_refunded: 3000 } }
			// Stripe returns newest-first — the provider must re-sort by `created` ascending.
			fake.listedRefunds = {
				data: [
					{ id: 're_2', amount: 1000, status: 'succeeded', created: 200 },
					{ id: 're_1', amount: 2000, status: 'succeeded', created: 100 },
				],
			}

			const result = await provider.getRefundStatus('pi_1')

			expect(arg(fake, 'paymentIntents.retrieve')).toBe('pi_1')
			expect(arg(fake, 'refunds.list')).toEqual({ payment_intent: 'pi_1', limit: 100 })
			expect(result).toEqual({
				refundedTotalCents: 3000,
				refunds: [
					{ gatewayRef: 're_1', amountCents: 2000 },
					{ gatewayRef: 're_2', amountCents: 1000 },
				],
			})
		})

		it('no refunds → { refundedTotalCents: 0, refunds: [] }', async () => {
			fake.retrievedPaymentIntent = { id: 'pi_3', latest_charge: null }
			fake.listedRefunds = { data: [] }

			const result = await provider.getRefundStatus('pi_3')

			expect(result).toEqual({ refundedTotalCents: 0, refunds: [] })
		})

		it('ignores non-succeeded refunds (pending/failed) — never counted as confirmed', async () => {
			fake.retrievedPaymentIntent = { id: 'pi_4', latest_charge: null }
			fake.listedRefunds = {
				data: [
					{ id: 're_pending', amount: 500, status: 'pending', created: 100 },
					{ id: 're_failed', amount: 500, status: 'failed', created: 200 },
				],
			}

			const result = await provider.getRefundStatus('pi_4')

			expect(result).toEqual({ refundedTotalCents: 0, refunds: [] })
		})
	})

	describe('getChargebackStatus', () => {
		it('lists disputes for the resolved charge and returns refs in gateway order — 2 disputes (AC-6, T5 identity regime)', async () => {
			fake.retrievedPaymentIntent = { id: 'pi_1', latest_charge: { id: 'ch_1' } }
			fake.listedDisputes = { data: [{ id: 'dp_1' }, { id: 'dp_2' }] }

			const result = await provider.getChargebackStatus('pi_1')

			expect(arg(fake, 'paymentIntents.retrieve')).toBe('pi_1')
			expect(arg(fake, 'paymentIntents.retrieve', 0, 1)).toEqual({ expand: ['latest_charge'] })
			expect(arg(fake, 'disputes.list')).toEqual({ charge: 'ch_1', limit: 100 })
			expect(result).toEqual({ chargedBack: true, disputeRefs: ['dp_1', 'dp_2'] })
		})

		it('empty dispute list → { chargedBack: false, disputeRefs: [] }', async () => {
			fake.retrievedPaymentIntent = { id: 'pi_2', latest_charge: { id: 'ch_2' } }
			fake.listedDisputes = { data: [] }

			const result = await provider.getChargebackStatus('pi_2')

			expect(result).toEqual({ chargedBack: false, disputeRefs: [] })
		})

		it('resolves a string (unexpanded) latest_charge id the same way', async () => {
			fake.retrievedPaymentIntent = { id: 'pi_3', latest_charge: 'ch_3' }
			fake.listedDisputes = { data: [{ id: 'dp_3' }] }

			const result = await provider.getChargebackStatus('pi_3')

			expect(arg(fake, 'disputes.list')).toEqual({ charge: 'ch_3', limit: 100 })
			expect(result).toEqual({ chargedBack: true, disputeRefs: ['dp_3'] })
		})

		it('a PaymentIntent with no charge at all throws PROVIDER_ERROR — never a lying false', async () => {
			fake.retrievedPaymentIntent = { id: 'pi_4', latest_charge: null }

			await expect(provider.getChargebackStatus('pi_4')).rejects.toMatchObject({ name: 'PROVIDER_ERROR' })
			expect(fake.calls['disputes.list']).toBeUndefined()
		})

		it('propagates a disputes.list API error (never swallowed into a lying false)', async () => {
			fake.retrievedPaymentIntent = { id: 'pi_5', latest_charge: { id: 'ch_5' } }
			const apiError = new Error('stripe unavailable')
			fake.disputesListError = apiError

			await expect(provider.getChargebackStatus('pi_5')).rejects.toBe(apiError)
		})

		it('the base abstraction default throws PROVIDER_CAPABILITY_UNSUPPORTED for a non-overriding provider', async () => {
			const bare = new BareProvider()

			await expect(bare.getChargebackStatus('pi_1')).rejects.toMatchObject({ name: 'PROVIDER_CAPABILITY_UNSUPPORTED' })
		})
	})

	describe('getCheckoutSessionStatus', () => {
		it('open session (status !== complete/expired) → { state: open }, no PI/SI retrieved', async () => {
			fake.retrievedCheckoutSession = { id: 'cs_open', status: 'open', mode: 'payment' }

			const result = await provider.getCheckoutSessionStatus('cs_open')

			expect(result).toEqual({ state: 'open' })
			expect(fake.calls['paymentIntents.retrieve']).toBeUndefined()
			expect(fake.calls['setupIntents.retrieve']).toBeUndefined()
		})

		it('expired session → { state: expired }, terminal, no PI/SI retrieved', async () => {
			fake.retrievedCheckoutSession = { id: 'cs_exp', status: 'expired', mode: 'payment' }

			const result = await provider.getCheckoutSessionStatus('cs_exp')

			expect(result).toEqual({ state: 'expired' })
			expect(fake.calls['paymentIntents.retrieve']).toBeUndefined()
		})

		// Finding [10]: `status: 'complete'` alone doesn't mean money moved — an async payment method
		// can leave the Session complete with `payment_status: 'unpaid'` (still settling). The poll
		// must not report `paid` ahead of the real webhook's own payment_status branch.
		it('complete session with payment_status unpaid (async payment still settling) → { state: open }, no PI retrieved', async () => {
			fake.retrievedCheckoutSession = {
				id: 'cs_unpaid',
				status: 'complete',
				payment_status: 'unpaid',
				mode: 'payment',
				payment_intent: 'pi_unpaid',
				amount_total: 1500,
			}

			const result = await provider.getCheckoutSessionStatus('cs_unpaid')

			expect(result).toEqual({ state: 'open' })
			expect(fake.calls['paymentIntents.retrieve']).toBeUndefined()
		})

		it('complete payment-mode session → paid, retrieves the PI expanding payment_method, carries gatewayTxId/amountCents/instrument', async () => {
			fake.retrievedCheckoutSession = {
				id: 'cs_pay',
				status: 'complete',
				payment_status: 'paid',
				mode: 'payment',
				payment_intent: 'pi_1',
				amount_total: 1500,
			}
			fake.retrievedPaymentIntent = {
				id: 'pi_1',
				amount_received: 1500,
				payment_method: { id: 'pm_1', card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030 } },
			}

			const result = await provider.getCheckoutSessionStatus('cs_pay')

			expect(arg(fake, 'checkout.sessions.retrieve')).toBe('cs_pay')
			expect(arg(fake, 'paymentIntents.retrieve')).toBe('pi_1')
			expect(arg(fake, 'paymentIntents.retrieve', 0, 1)).toEqual({ expand: ['payment_method'] })
			expect(result).toEqual({
				state: 'paid',
				paid: {
					gatewayTxId: 'pi_1',
					amountCents: 1500,
					instrument: {
						type: PaymentMethodType.CARD,
						pmRef: 'pm_1',
						supportsOffSession: true,
						captureOrigin: CaptureOrigin.CHECKOUT_PAYMENT,
						originGatewayTxId: 'pi_1',
						brand: 'visa',
						last4: '4242',
						expMonth: 12,
						expYear: 2030,
					},
				},
			})
		})

		it('complete payment-mode session with an unexpanded (string) payment_method → paid with no instrument', async () => {
			fake.retrievedCheckoutSession = {
				id: 'cs_pay2',
				status: 'complete',
				payment_status: 'paid',
				mode: 'payment',
				payment_intent: 'pi_2',
				amount_total: 2000,
			}
			fake.retrievedPaymentIntent = { id: 'pi_2', amount_received: 2000, payment_method: 'pm_2' }

			const result = await provider.getCheckoutSessionStatus('cs_pay2')

			expect(result).toEqual({ state: 'paid', paid: { gatewayTxId: 'pi_2', amountCents: 2000, instrument: undefined } })
		})

		it('complete setup-mode session → paid, retrieves the SI expanding payment_method, no gatewayTxId/amountCents (setup has no CIT)', async () => {
			fake.retrievedCheckoutSession = {
				id: 'cs_setup',
				status: 'complete',
				payment_status: 'no_payment_required',
				mode: 'setup',
				setup_intent: 'seti_1',
			}
			fake.retrievedSetupIntent = {
				id: 'seti_1',
				payment_method: { id: 'pm_3', card: { brand: 'mastercard', last4: '1111', exp_month: 1, exp_year: 2031 } },
			}

			const result = await provider.getCheckoutSessionStatus('cs_setup')

			expect(arg(fake, 'setupIntents.retrieve')).toBe('seti_1')
			expect(arg(fake, 'setupIntents.retrieve', 0, 1)).toEqual({ expand: ['payment_method'] })
			expect(result).toEqual({
				state: 'paid',
				paid: {
					instrument: {
						type: PaymentMethodType.CARD,
						pmRef: 'pm_3',
						supportsOffSession: true,
						captureOrigin: CaptureOrigin.CHECKOUT_SETUP,
						brand: 'mastercard',
						last4: '1111',
						expMonth: 1,
						expYear: 2031,
					},
				},
			})
		})

		it('the base abstraction default throws PROVIDER_CAPABILITY_UNSUPPORTED for a non-overriding provider', async () => {
			const bare = new BareProvider()

			await expect(bare.getCheckoutSessionStatus('cs_1')).rejects.toMatchObject({ name: 'PROVIDER_CAPABILITY_UNSUPPORTED' })
		})
	})

	describe('createPix', () => {
		it('creates a pix PaymentIntent and extracts the QR from next_action', async () => {
			fake.paymentIntentResult = {
				id: 'pi_pix',
				status: 'requires_action',
				next_action: {
					pix_display_qr_code: {
						image_url_png: 'https://stripe/qr.png',
						hosted_instructions_url: 'https://stripe/pix',
						data: '00020126-emv-copy-paste',
						expires_at: 1_800_000_000,
					},
				},
			}

			const pix = await provider.createPix({
				externalReference: 'lago_inv_3',
				amountCents: 19900,
				idemKey: 'pix_1',
				payer: { name: 'Ana', email: 'ana@x.com', document: '123.456.789-09' },
			})

			const [params, options] = fake.calls['paymentIntents.create']![0] as [any, any]
			expect(params).toMatchObject({ amount: 19900, currency: 'brl', payment_method_types: ['pix'], confirm: true })
			expect(params.metadata).toEqual({ engineInvoiceId: 'lago_inv_3', payerDocument: '12345678909' })
			expect(params.receipt_email).toBe('ana@x.com')
			expect(options).toEqual({ idempotencyKey: 'pix_1' })
			expect(pix.pixId).toBe('pi_pix')
			expect(pix.qr).toBe('https://stripe/qr.png')
			expect(pix.copyPaste).toBe('00020126-emv-copy-paste')
			expect(pix.expiresAt).toEqual(new Date(1_800_000_000 * 1000))
		})

		it('falls back to hosted instructions + a default expiry when fields are absent', async () => {
			fake.paymentIntentResult = {
				id: 'pi_pix2',
				status: 'requires_action',
				next_action: { pix_display_qr_code: { hosted_instructions_url: 'https://h' } },
			}

			const pix = await provider.createPix({ externalReference: 'inv', amountCents: 100, idemKey: 'k' })

			expect(pix.qr).toBe('https://h')
			expect(pix.copyPaste).toBe('')
			expect(pix.expiresAt.getTime()).toBeGreaterThan(Date.now())
		})

		it('mapeia Pix-não-ativado-na-conta (payment_method_types inválido) para PROVIDER_CAPABILITY_UNSUPPORTED, não 500', async () => {
			// Conta Stripe sem Pix ativado rejeita o payment_method_type com este erro.
			fake.paymentIntentError = new Stripe.errors.StripeInvalidRequestError({
				message: 'The payment method type "pix" is invalid.',
				type: 'invalid_request_error',
				param: 'payment_method_types',
			} as unknown as ConstructorParameters<typeof Stripe.errors.StripeInvalidRequestError>[0])

			await expect(provider.createPix({ externalReference: 'inv', amountCents: 100, idemKey: 'k' })).rejects.toMatchObject({
				name: 'PROVIDER_CAPABILITY_UNSUPPORTED',
			})
		})
	})
})
