import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import Stripe from 'stripe'
import { ProductConfig } from '@shared/config'
import { CurrencyCode } from '@template/contracts-typescript/wire/enums'

import { StripePaymentProvider } from './StripePaymentProvider'
import { CheckoutIntent, DeclineReason } from '@template/contracts-typescript/wire/enums'

// Integration suite — hits the REAL Stripe test API (not the FakeStripe unit stub). Opt-in:
// runs only with STRIPE_INTEGRATION=1 AND a test-mode key, so the normal `bun test`/CI/pre-push
// suite (no network, no key) skips it entirely. Run:
//   STRIPE_INTEGRATION=1 STRIPE_API_KEY=sk_test_… bun test src/billing/.../StripePaymentProvider.integration.test.ts
const RUN = process.env.STRIPE_INTEGRATION === '1' && ProductConfig.env.STRIPE_API_KEY.startsWith('sk_test_')

describe.skipIf(!RUN)('StripePaymentProvider (integration — real Stripe test API)', () => {
	const provider = new StripePaymentProvider()
	// Constructed in beforeAll (not at describe-body eval): describe.skipIf still runs this callback
	// to register the skipped tests, and `new Stripe('')` would throw when the key is absent.
	let stripe: Stripe
	const ownerId = `it-${Date.now()}`
	const engineInvoiceId = `native:${ownerId}:1`
	let customerId: string // the test fixture customer — captured directly, no search lag
	const created: { pis: string[] } = { pis: [] }

	const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

	// customers.search is index-backed and lags creation by seconds — poll until it converges.
	const searchByOwner = async (owner: string, retries = 20): Promise<Stripe.Customer[]> => {
		for (let i = 0; i < retries; i++) {
			const found = await stripe.customers.search({ query: `metadata['ownerId']:'${owner}'` })
			if (found.data.length > 0) return found.data
			await sleep(2000)
		}
		return []
	}

	// Vault an off-session-capable card by confirming a SetupIntent (mirrors the checkout-setup
	// flow); returns the attached pm_ id. Accepts a shared test PaymentMethod id (pm_card_visa) or
	// a PaymentMethod freshly built from a test token.
	const vaultCard = async (pm = 'pm_card_visa'): Promise<string> => {
		const si = await stripe.setupIntents.create({
			customer: customerId,
			payment_method: pm,
			confirm: true,
			usage: 'off_session',
			payment_method_types: ['card'],
		})
		return si.payment_method as string
	}

	// The "attaches fine, DECLINES at charge" test card (4000 0000 0000 0341): setup succeeds so the
	// card vaults, and only the later off-session PaymentIntent is declined — the real dunning shape.
	const vaultChargeFailCard = async (): Promise<string> => {
		const pm = await stripe.paymentMethods.create({ type: 'card', card: { token: 'tok_chargeCustomerFail' } })
		return vaultCard(pm.id)
	}

	beforeAll(async () => {
		stripe = new Stripe(ProductConfig.env.STRIPE_API_KEY)
		// Deterministic fixture customer (create returns the id immediately — no search dependency).
		const customer = await stripe.customers.create({ name: 'Integration Fixture', email: `${ownerId}@test.dev`, metadata: { ownerId } })
		customerId = customer.id
	})

	afterAll(async () => {
		// Best-effort cleanup — refund the PaymentIntents this run created (test-mode money).
		for (const pi of created.pis) await stripe.refunds.create({ payment_intent: pi }).catch(() => {})
	})

	// Longer timeouts: customers.search is eventually-consistent (index lag) — the poll can take
	// 10-20s to converge, well past bun's 5s default.
	it('ensureCustomer cria um customer buscável por metadata ownerId (índice de busca eventual)', async () => {
		const freshOwner = `${ownerId}-ec`
		await provider.ensureCustomer({
			ownerId: freshOwner,
			owner: { name: 'Ensure Test', email: `${freshOwner}@test.dev`, document: '24971563792' },
		})
		const data = await searchByOwner(freshOwner)
		expect(data.length).toBeGreaterThan(0)
		expect(data[0]?.metadata.ownerId).toBe(freshOwner)
	}, 60_000)

	it('ensureCustomer é idempotente — o idemKey customer:{ownerId} fixa UM único customer', async () => {
		const freshOwner = `${ownerId}-idem`
		const owner = { name: 'Idem', email: `${freshOwner}@test.dev` }
		await provider.ensureCustomer({ ownerId: freshOwner, owner })
		await provider.ensureCustomer({ ownerId: freshOwner, owner })
		// Deterministic (no search lag): replaying the SAME idempotent create the provider used
		// returns the SAME customer both times — proving the idemKey maps to one record, which is
		// exactly the anti-duplicate guarantee (a mismatch in params would 400 on the idemKey).
		const replay = () =>
			stripe.customers.create(
				{ name: owner.name, email: owner.email, metadata: { ownerId: freshOwner } },
				{ idempotencyKey: `customer:${freshOwner}` },
			)
		const [a, b] = [await replay(), await replay()]
		expect(a.id).toBe(b.id)
	})

	it('createCheckoutSession(payment) devolve uma sessão de checkout hospedada real', async () => {
		const res = await provider.createCheckoutSession({
			ownerId,
			intent: CheckoutIntent.PAYMENT,
			engineInvoiceId,
			amountCents: 500,
			currency: CurrencyCode.BRL,
			successUrl: 'https://app.test/account?checkout=success',
			cancelUrl: 'https://app.test/account?checkout=canceled',
			idemKey: `it-checkout-pay-${ownerId}`,
		})
		expect(res.url).toContain('checkout.stripe.com')
		expect(res.sessionRef).toMatch(/^cs_test_/)
		expect(res.expiresAt).toBeInstanceOf(Date)
	})

	it('createCheckoutSession(setup) devolve uma sessão de setup (troca de cartão)', async () => {
		const res = await provider.createCheckoutSession({
			ownerId,
			intent: CheckoutIntent.SETUP,
			successUrl: 'https://app.test/account',
			cancelUrl: 'https://app.test/account',
			idemKey: `it-checkout-setup-${ownerId}`,
		})
		expect(res.sessionRef).toMatch(/^cs_test_/)
	})

	it('chargeStoredOnSession cobra um cartão vaultado off-session (CIT) → ok, gatewayTxId pi_', async () => {
		const pmRef = await vaultCard()
		const result = await provider.chargeStoredOnSession({ pmRef, ownerId, amountCents: 500, engineInvoiceId, idemKey: `it-cit-${ownerId}` })
		expect(result.ok).toBe(true)
		if (result.ok) {
			expect(result.gatewayTxId).toMatch(/^pi_/)
			created.pis.push(result.gatewayTxId)
		}
	})

	it('chargeOffSession com cartão que vaulta mas recusa na cobrança → ok:false + declineCode', async () => {
		const pmRef = await vaultChargeFailCard()
		const result = await provider.chargeOffSession({ pmRef, amountCents: 500, idemKey: `it-decline-${ownerId}`, code: engineInvoiceId })
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.declineCode).toBe(DeclineReason.CARD_DECLINED)
	})

	it('cancelCharge estorna um PaymentIntent capturado (refund) sem lançar', async () => {
		const pmRef = await vaultCard()
		const charge = await provider.chargeStoredOnSession({
			pmRef,
			ownerId,
			amountCents: 700,
			engineInvoiceId: `${engineInvoiceId}:refund`,
			idemKey: `it-refundable-${ownerId}`,
		})
		expect(charge.ok).toBe(true)
		if (!charge.ok) return
		await provider.cancelCharge({ gatewayTxId: charge.gatewayTxId, idemKey: `it-cancel-${ownerId}` })
		const refunds = await stripe.refunds.list({ payment_intent: charge.gatewayTxId })
		expect(refunds.data.length).toBeGreaterThan(0)
	})

	it('createPix → PROVIDER_CAPABILITY_UNSUPPORTED (conta test sem capability pix_payments)', async () => {
		await expect(
			provider.createPix({ externalReference: engineInvoiceId, amountCents: 500, idemKey: `it-pix-${ownerId}` }),
		).rejects.toMatchObject({ name: 'PROVIDER_CAPABILITY_UNSUPPORTED' })
	})
})
