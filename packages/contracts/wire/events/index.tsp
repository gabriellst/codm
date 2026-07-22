import "./_base.tsp";

// A thin trigger consumed by the Go `internal/activity` worker-reference context (the gateway side,
// untouched this phase). The TS billing context that PRODUCED it was stripped, but the wire event
// stays as a cross-language contract stub so the Go consumer keeps compiling until the gateway phase.
// It carries no billing enum payload — only the envelope (ownerId/entityId/occurredAt).
import "./billing-subscription-changed.tsp";

// ── CodeDM Phase-0 contract lock — the frozen integration-event set (draft "Contract draft
// (to freeze)"). Cross-boundary facts on the outbox (`integration.*` prefix routes them to the
// ExternalMediator). Nested VOs (ContactRef, IssueLabel) are flattened to scalar fields because the
// wire codegen carries scalars + enums + arrays, not nested object models. ──

// Gateway <-> Core (BC1 <-> BC4) — the WhatsApp gateway lineage (descends the medscall channel set)
import "./channel-message-received.tsp";
import "./channel-connected.tsp";
import "./channel-disconnected.tsp";
import "./channel-pairing-qr-updated.tsp";
import "./channel-outbound-delivered.tsp";
import "./channel-delivery-requested.tsp";

// Core <-> Terminal (BC4 <-> BC5 <-> BC6) — routing, issue lifecycle, artifacts, workspace refs
import "./thread-attached.tsp";
import "./message-classified.tsp";
import "./issue-opened.tsp";
import "./issue-completed.tsp";
import "./agent-reply-drafted.tsp";
import "./issue-stop-raised.tsp";
import "./issue-stop-resolved.tsp";
import "./issue-archived.tsp";
import "./artifact-recorded.tsp";
import "./workspace-removed.tsp";
