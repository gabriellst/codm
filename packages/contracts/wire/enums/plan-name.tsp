namespace TemplateContracts;

@doc("The generic default subscription-plan plug — a downstream product renames/extends these members together with the PlanRegistry catalog. FREE is the virtual floor: it never creates an engine subscription (absence of a paid subscription reads as FREE). Distinct axis from PlanTier (quota tiering); see the PlanName/PlanTier reconciliation note.")
enum PlanName {
  FREE: "FREE",
  STARTER: "STARTER",
  PRO: "PRO",
}
