namespace TemplateContracts;

@doc("Product-plug quota-dimension vocabulary — the single flat registry of every quota key the system meters or hard-limits, shared by billing (PlanRegistry per-plan quotas, OVERAGE invoice lines) and quota (entitlements, counters, governors). The single member is a GENERIC PLACEHOLDER so z.enum(QuotaKey) / Record<QuotaKey,…> stay constructible; a downstream product replaces/extends it with real dimensions. Validation/schema helpers live in a shared class, not here.")
enum QuotaKey {
  EXAMPLE_KEY: "EXAMPLE_KEY",
}
