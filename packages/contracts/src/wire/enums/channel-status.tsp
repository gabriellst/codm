namespace TemplateContracts;

@doc("Connection lifecycle of a Channel. CREATED (row minted) → CONNECTING (QR/OAuth pairing in progress) → CONNECTED (reachable) → DISCONNECTED (session torn down); DELETED is the soft-delete tombstone. Reconciled to the rich gateway value-set (Go domain is authoritative). Persisted as the `status` column on channel-side projections (Go-owned).")
enum ChannelStatus {
  CREATED: "CREATED",
  CONNECTING: "CONNECTING",
  CONNECTED: "CONNECTED",
  DISCONNECTED: "DISCONNECTED",
  DELETED: "DELETED",
}
