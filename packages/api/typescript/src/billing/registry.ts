// Per-env DI bindings for the billing BC (W2a foundation+engine slice).
import './errors' // Side-effect: registers context error codes with the framework runtime registry.

import { type InstanceRegistry, expandBindings } from '@template/core-typescript'
import { ProductConfig } from '@shared/config'
import {
	SubscriptionRepository,
	DrizzleSubscriptionRepository,
	MockSubscriptionRepository,
	InvoiceRepository,
	DrizzleInvoiceRepository,
	MockInvoiceRepository,
	ChargeRepository,
	DrizzleChargeRepository,
	MockChargeRepository,
	CreditNoteRepository,
	DrizzleCreditNoteRepository,
	MockCreditNoteRepository,
	DisputeRepository,
	DrizzleDisputeRepository,
	MockDisputeRepository,
	PaymentMethodRepository,
	DrizzlePaymentMethodRepository,
	MockPaymentMethodRepository,
	CheckoutSessionRepository,
	DrizzleCheckoutSessionRepository,
	MockCheckoutSessionRepository,
	BillingProfileRepository,
	DrizzleBillingProfileRepository,
	MockBillingProfileRepository,
} from './repositories'
import {
	InvoiceStatusDeriver,
	DrizzleInvoiceStatusDeriver,
	MockInvoiceStatusDeriver,
	SubscriptionAccessDeriver,
	DrizzleSubscriptionAccessDeriver,
	MockSubscriptionAccessDeriver,
	InvoiceNumberSequencer,
	DrizzleInvoiceNumberSequencer,
	MockInvoiceNumberSequencer,
	PaymentProvider,
	MockPaymentProvider,
	SandboxPaymentProvider,
	PagarMePaymentProvider,
	StripePaymentProvider,
	AsaasPaymentProvider,
	MercadoPagoPaymentProvider,
	PagBankPaymentProvider,
	StripeWebhookVerifier,
	StripeWebhookMapper,
	AsaasWebhookVerifier,
	AsaasWebhookMapper,
	MercadoPagoWebhookVerifier,
	MercadoPagoWebhookMapper,
	PagBankWebhookVerifier,
	PagBankWebhookMapper,
	PagarMeWebhookVerifier,
	PagarMeWebhookMapper,
	UsageRollup,
	DrizzleUsageRollup,
	MockUsageRollup,
	UsageSource,
	DefaultUsageSource,
	OverageCalculator,
} from './services'

// UsageSource is bound to an EMPTY DefaultUsageSource (no counters → `usage` always resolves 0) so
// this context's own container/tests resolve in isolation. The real cross-context counters map only
// exists at the shared merge root (the composition root that legitimately knows every context) — a
// downstream product OVERRIDES this binding there. Same pattern as quota's own placeholder for its
// sibling `QuotaUsageSource` port (see src/shared/registry.ts).
const placeholderUsageSource = { useFactory: () => new DefaultUsageSource({}) }

// Every gateway BEYOND the PaymentProvider-token slot is injected by concrete class into
// PaymentProviderFactory (mapped by .platform) and into the webhook factories (mapped by source).
// real-only, self-bound singletons: which one handles NEW relationships is decided by
// BILLING_DEFAULT_GATEWAY, never by which classes are bound.
const GATEWAY_CLASSES = [
	StripePaymentProvider,
	StripeWebhookVerifier,
	StripeWebhookMapper,
	AsaasPaymentProvider,
	AsaasWebhookVerifier,
	AsaasWebhookMapper,
	MercadoPagoPaymentProvider,
	MercadoPagoWebhookVerifier,
	MercadoPagoWebhookMapper,
	PagBankPaymentProvider,
	PagBankWebhookVerifier,
	PagBankWebhookMapper,
	PagarMeWebhookVerifier,
	PagarMeWebhookMapper,
]

export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([
	{ token: SubscriptionRepository, mock: MockSubscriptionRepository, real: DrizzleSubscriptionRepository },
	{ token: InvoiceRepository, mock: MockInvoiceRepository, real: DrizzleInvoiceRepository },
	{ token: ChargeRepository, mock: MockChargeRepository, real: DrizzleChargeRepository },
	{ token: CreditNoteRepository, mock: MockCreditNoteRepository, real: DrizzleCreditNoteRepository },
	{ token: DisputeRepository, mock: MockDisputeRepository, real: DrizzleDisputeRepository },
	{ token: PaymentMethodRepository, mock: MockPaymentMethodRepository, real: DrizzlePaymentMethodRepository },
	{ token: CheckoutSessionRepository, mock: MockCheckoutSessionRepository, real: DrizzleCheckoutSessionRepository },
	{ token: BillingProfileRepository, mock: MockBillingProfileRepository, real: DrizzleBillingProfileRepository },
	{ token: InvoiceStatusDeriver, mock: MockInvoiceStatusDeriver, real: DrizzleInvoiceStatusDeriver },
	{ token: SubscriptionAccessDeriver, mock: MockSubscriptionAccessDeriver, real: DrizzleSubscriptionAccessDeriver },
	{ token: InvoiceNumberSequencer, mock: MockInvoiceNumberSequencer, real: DrizzleInvoiceNumberSequencer },
	// Gateway port: the in-memory Mock in mock AND integration (the base template ships no networked
	// gateway in tests; the Sandbox reference adapter lands with the webhook pipeline). In real,
	// sandbox mode (dev-only, boot-asserted out of production) swaps the fake gateway in Pagar.me's
	// place while the native ENGINE mints real invoices — fake money. Registry lists are built at
	// import time, so the flag decides the binding once, at boot.
	{
		token: PaymentProvider,
		mock: MockPaymentProvider,
		integration: MockPaymentProvider,
		real: ProductConfig.env.BILLING_SANDBOX ? SandboxPaymentProvider : PagarMePaymentProvider,
	},
	// Native usage-metering slice (medscall@f04e8a0f port): Mock rollup in mock, Drizzle against
	// PGlite/production elsewhere; UsageSource placeholder resolves 0 usage until a product overrides
	// it at the merge root; OverageCalculator is a pure calculator, self-bound in every env.
	{ token: UsageRollup, mock: MockUsageRollup, real: DrizzleUsageRollup },
	{ token: UsageSource, mock: placeholderUsageSource, real: placeholderUsageSource },
	{ token: OverageCalculator, mock: OverageCalculator, real: OverageCalculator },
	...GATEWAY_CLASSES.map(cls => ({ token: cls, mock: null, integration: null, real: cls })),
])
