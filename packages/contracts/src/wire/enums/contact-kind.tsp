namespace TemplateContracts;

@doc("Whether a channel counterparty is a single user, a group conversation, or a broadcast list. Flattened out of the ContactRef value object onto the wire (the codegen carries scalars + enums, not nested models); the domain reassembles ContactRef as a Value Object. Reconciled to the rich gateway RemoteType value-set (Go domain is authoritative): USER, GROUP, BROADCAST. The Go domain RemoteType enum aliases this wire enum.")
enum ContactKind {
  USER: "USER",
  GROUP: "GROUP",
  BROADCAST: "BROADCAST",
}
