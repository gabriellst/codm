import "./_base.tsp";

// A thin trigger consumed by the Go `internal/activity` worker-reference context (the gateway side,
// untouched this phase). The TS billing context that PRODUCED it was stripped, but the wire event
// stays as a cross-language contract stub so the Go consumer keeps compiling until the gateway phase.
// It carries no billing enum payload — only the envelope (ownerId/entityId/occurredAt).
import "./billing-subscription-changed.tsp";

// NOTE: CodeDM populates the real integration-event set during its Phase-0 contract lock
// (channel / thread / issue / artifact events). A product grafting the tenant-membership exemplar
// (examples/tenant-membership/contracts/) moves its .tsp back here.
