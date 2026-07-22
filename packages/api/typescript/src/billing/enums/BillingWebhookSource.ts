// The origin of an inbound billing webhook. Pagar.me / Stripe / Asaas / Mercado Pago / PagBank =
// the gateway (payment outcomes). One ingest endpoint (/billing/webhooks/:source) routes to the
// right verifier + mapper. DECOMMISSIONED members keep their slot so historical rows remain
// readable even after their verifier/mapper is removed.
export enum BillingWebhookSource {
	PAGARME = 'PAGARME',
	STRIPE = 'STRIPE',
	ASAAS = 'ASAAS',
	// DECOMMISSIONED (2026-07-15): implementation removed — enum member stays so historical rows remain readable
	GETNET = 'GETNET',
	MERCADOPAGO = 'MERCADOPAGO',
	PAGBANK = 'PAGBANK',
	// DECOMMISSIONED (2026-07-15): implementation removed — enum member stays so historical rows remain readable
	INFINITEPAY = 'INFINITEPAY',
	// DECOMMISSIONED (2026-07-15): implementation removed — enum member stays so historical rows remain readable
	REDE = 'REDE',
}
