import "./_base.tsp";

// Billing → Quota: thin trigger — subscription posture changed; consumers re-derive entitlement.
import "./billing-subscription-changed.tsp";

// NOTE: the owner member-invitation event moved to examples/tenant-membership/contracts/ (decision
// D2 — membership is a Tier-3 exemplar, not base template). A product grafting the exemplar moves
// the .tsp back here and re-imports it.
