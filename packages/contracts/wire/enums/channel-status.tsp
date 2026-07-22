namespace TemplateContracts;

@doc("Connection health of a Channel. DISCONNECTED (no session) → PAIRING (QR/OAuth in progress) → CONNECTED (reachable). Descends the medscall channel status.")
enum ChannelStatus {
  DISCONNECTED: "DISCONNECTED",
  PAIRING: "PAIRING",
  CONNECTED: "CONNECTED",
}
