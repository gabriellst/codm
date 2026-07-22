namespace TemplateContracts;

@doc("Whether a channel counterparty is a single contact, a group conversation, or a broadcast list. Flattened out of the ContactRef value object onto the wire (the codegen carries scalars + enums, not nested models); the domain reassembles ContactRef as a Value Object. Absorbs the medscall channel RemoteType {USER->CONTACT, GROUP, BROADCAST}: BROADCAST is added here rather than minting a parallel RemoteType enum (extend-over-duplicate); the frozen CONTACT/GROUP values are untouched.")
enum ContactKind {
  CONTACT: "CONTACT",
  GROUP: "GROUP",
  BROADCAST: "BROADCAST",
}
