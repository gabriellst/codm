namespace TemplateContracts;

@doc("The payment gateway a billing record was created on — the single registry PaymentProviderFactory dispatches on. A record (instrument/charge/checkout) stays pinned to its stored platform forever. DECOMMISSIONED members keep their slot so historical rows stay readable after their adapter is removed; routing narrows against the ACTIVE provider set (PaymentProviderFactory.activePlatforms), never the full enum.")
enum BillingPlatform {
  PAGARME: "PAGARME",
  STRIPE: "STRIPE",
  ASAAS: "ASAAS",
  // DECOMMISSIONED — member kept so historical rows stay readable
  GETNET: "GETNET",
  MERCADOPAGO: "MERCADOPAGO",
  PAGBANK: "PAGBANK",
  // DECOMMISSIONED
  INFINITEPAY: "INFINITEPAY",
  // DECOMMISSIONED
  REDE: "REDE",
}
