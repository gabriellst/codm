namespace TemplateContracts;

@doc("Subscription plan tier — quota tiering axis consumed by the quota context (QuotaKey-keyed entitlements). Distinct from billing's PlanName (the subscription-plan plug); see the PlanName/PlanTier reconciliation note in the reorg plan.")
enum PlanTier {
  BASIC: "BASIC",
  INTERMEDIATE: "INTERMEDIATE",
  ADVANCED: "ADVANCED",
  UNLIMITED: "UNLIMITED",
}
