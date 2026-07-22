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

// Gateway full-port — the complete medscall channel wire surface, retargeted to the codedm
// envelope. Everything below is defined-and-dormant except where the first gateway phase
// exercises it; every fact is an `integration.*` event so the outbox routes it to the
// ExternalMediator (the assert-wire-names gate enforces the prefix).
// Message lifecycle (drives the gateway.messages projection alongside the frozen received/outbound).
import "./channel-message-sent.tsp";
import "./channel-message-edited.tsp";
import "./channel-message-deleted.tsp";
import "./channel-message-delivered.tsp";
import "./channel-message-seen.tsp";
// Remote (contact/group/broadcast) lifecycle.
import "./channel-remote-created.tsp";
import "./channel-remote-updated.tsp";
import "./channel-remote-deleted.tsp";
// Group membership.
import "./channel-membership-added.tsp";
import "./channel-membership-removed.tsp";
// Bootstrap / history sync progress.
import "./channel-messages-synced.tsp";
import "./channel-remotes-synced.tsp";
import "./channel-sync-started.tsp";
import "./channel-sync-progress.tsp";
import "./channel-sync-completed.tsp";
// Presence.
import "./channel-presence-updated.tsp";
import "./channel-chat-presence-updated.tsp";
// Session / platform out-of-band.
import "./channel-logged-out.tsp";
import "./channel-special-platform-event-received.tsp";

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
