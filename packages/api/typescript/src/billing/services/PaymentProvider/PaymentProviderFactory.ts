import { injectable } from 'tsyringe-neo'
import { BaseError } from '@template/core-typescript'

import type { InterfaceErrors } from '@billing/errors'
import { ProductConfig } from '@shared/config'
import { PaymentProvider } from './PaymentProvider'
import { StripePaymentProvider } from './StripePaymentProvider'
import { AsaasPaymentProvider } from './AsaasPaymentProvider'
import { MercadoPagoPaymentProvider } from './MercadoPagoPaymentProvider'
import { PagBankPaymentProvider } from './PagBankPaymentProvider'
import { BillingPlatform, PaymentMethodType } from '@template/contracts-typescript/wire/enums'

/**
 * Platform-keyed provider resolver — parallels `BillingWebhookMapperFactory` /
 * `BillingWebhookVerifierFactory`. The Pagar.me/Sandbox slot is injected through the
 * `PaymentProvider` DI token itself (so the mock/integration/real registry.ts swap —
 * MockPaymentProvider in tests, PagarMe/Sandbox in `real` — still applies); Stripe is injected by
 * its concrete class. Both are mapped by `.platform`. Adding a further gateway = inject its
 * concrete provider and extend the map; no caller/use-case changes.
 */
@injectable()
export class PaymentProviderFactory {
	private readonly providers: Partial<Record<BillingPlatform, PaymentProvider>>
	// The ACTIVE platform set — derived from the concrete providers this factory was actually
	// constructed with, typed as BillingPlatform[] with no cast (each `.platform` is already typed).
	// `BillingPlatform` itself still carries DECOMMISSIONED members (GETNET/INFINITEPAY/REDE — see
	// BillingPlatform.ts) whose implementation was removed but the enum member stays so historical
	// rows remain readable. Routing config must narrow against THIS set, never the full enum.
	private readonly activePlatforms: BillingPlatform[]

	constructor(
		pagarMe: PaymentProvider,
		stripe: StripePaymentProvider,
		asaas: AsaasPaymentProvider,
		mercadoPago: MercadoPagoPaymentProvider,
		pagBank: PagBankPaymentProvider,
	) {
		this.providers = {
			[pagarMe.platform]: pagarMe,
			[stripe.platform]: stripe,
			[asaas.platform]: asaas,
			[mercadoPago.platform]: mercadoPago,
			[pagBank.platform]: pagBank,
		}
		this.activePlatforms = [pagarMe.platform, stripe.platform, asaas.platform, mercadoPago.platform, pagBank.platform]
	}

	for(platform: BillingPlatform): PaymentProvider {
		const provider = this.providers[platform]
		if (!provider) {
			throw new BaseError<InterfaceErrors>('PROVIDER_ERROR', `No PaymentProvider registered for platform ${platform}`)
		}
		return provider
	}

	/**
	 * Decide which gateway handles a NEW payment relationship for this owner — a one-off pix
	 * charge (PixInvoicePaymentStrategy), instrument vaulting
	 * (UpdatePaymentMethod). Operations on an EXISTING instrument/charge must NOT come through
	 * here: they stay pinned to the platform the record was created on (`for(paymentMethod.platform)`
	 * in the MIT handler, `for(charge.platform)` in RefundInvoice) so a routing change can never
	 * strand a vaulted card or refund through the wrong gateway.
	 *
	 * Async on purpose: the decision is expected to grow real work (per-owner pinning read,
	 * method/currency routing, gateway health) — encapsulated in decidePlatform so callers
	 * never learn the routing rules.
	 */
	async decide(params: { ownerId: string }): Promise<PaymentProvider> {
		return this.for(await this.decidePlatform(params))
	}

	/**
	 * Like `decide`, but routes by PAYMENT METHOD: a per-method gateway override
	 * (BILLING_GATEWAY_PIX / BILLING_GATEWAY_CARD) wins, else it falls back to the same
	 * BILLING_DEFAULT_GATEWAY resolution. This is what makes a method available on a gateway that
	 * supports it even when the default gateway doesn't — e.g. cards on STRIPE but Pix routed to a
	 * gateway with Pix enabled. Still only for NEW payment relationships; existing records stay
	 * pinned to their stored platform (`for(record.platform)`).
	 */
	async decideForPaymentMethod(method: PaymentMethodType, params: { ownerId: string }): Promise<PaymentProvider> {
		return this.for(this.platformForMethod(method) ?? (await this.decidePlatform(params)))
	}

	/**
	 * A configured per-method gateway override, or undefined when none is set (→ default gateway).
	 * Throws LOUDLY (see `resolveConfiguredPlatform`) when the configured value names a real but
	 * DECOMMISSIONED platform — a stale `BILLING_GATEWAY_PIX`/`BILLING_GATEWAY_CARD` value must fail
	 * routing HERE, at resolution time, instead of passing narrowing and only surfacing as an opaque
	 * "No PaymentProvider registered" from `for()` at charge time (a silent new-payment outage).
	 */
	private platformForMethod(method: PaymentMethodType): BillingPlatform | undefined {
		// Read ProductConfig.env fresh (tests mutate it); empty string = unset → undefined → default.
		const perMethod: Partial<Record<PaymentMethodType, { value: string; envVar: string }>> = {
			[PaymentMethodType.PIX]: { value: ProductConfig.env.BILLING_GATEWAY_PIX, envVar: 'BILLING_GATEWAY_PIX' },
			[PaymentMethodType.CARD]: { value: ProductConfig.env.BILLING_GATEWAY_CARD, envVar: 'BILLING_GATEWAY_CARD' },
		}
		const configured = perMethod[method]
		if (!configured) return undefined
		return this.resolveConfiguredPlatform(configured.value, configured.envVar)
	}

	/**
	 * The configured default gateway for NEW payment relationships, narrowed from the raw
	 * BILLING_DEFAULT_GATEWAY env string to the typed enum WITHOUT a cast (a typo/unset value falls back
	 * to PAGARME rather than flowing through as an invalid platform). A DECOMMISSIONED value throws
	 * instead of silently falling back — see `resolveConfiguredPlatform`. The single typed accessor
	 * other billing code reads instead of re-narrowing (or `as`-casting) the env itself.
	 */
	defaultPlatform(): BillingPlatform {
		return this.resolveConfiguredPlatform(ProductConfig.env.BILLING_DEFAULT_GATEWAY, 'BILLING_DEFAULT_GATEWAY') ?? BillingPlatform.PAGARME
	}

	/**
	 * Narrows a configured platform string against the ACTIVE platform set (`activePlatforms`,
	 * derived from the providers this factory was constructed with), never against the full
	 * `BillingPlatform` enum — the enum still carries DECOMMISSIONED members whose implementation
	 * was removed.
	 *
	 * - Active member → returned.
	 * - A REAL `BillingPlatform` member that is decommissioned → throws LOUDLY, naming the env var
	 *   and the offending value, so a stale config is caught HERE instead of a confusing downstream
	 *   "No PaymentProvider registered" (or, worse, silently defaulting away from what an operator
	 *   explicitly configured — that could route real charges through the wrong gateway).
	 * - Garbage/unset (not any `BillingPlatform` member at all — typo, empty string) → undefined,
	 *   same as before: the caller falls back to the default gateway.
	 */
	private resolveConfiguredPlatform(configured: string, envVar: string): BillingPlatform | undefined {
		if (!configured) return undefined

		const active = this.activePlatforms.find(platform => platform === configured)
		if (active) return active

		const decommissioned = Object.values(BillingPlatform).find(platform => platform === configured)
		if (decommissioned) {
			throw new BaseError<InterfaceErrors>(
				'PROVIDER_ERROR',
				`${envVar}=${configured} is decommissioned — pick one of: ${this.activePlatforms.join(', ')}.`,
			)
		}

		return undefined
	}

	private async decidePlatform(_params: { ownerId: string }): Promise<BillingPlatform> {
		// The gateway for NEW payment relationships is a single global switch (BILLING_DEFAULT_GATEWAY);
		// this is the documented seam for future per-owner routing. Existing records stay pinned to
		// their stored platform (resolved via `for(...)`, never through here).
		return this.defaultPlatform()
	}
}
