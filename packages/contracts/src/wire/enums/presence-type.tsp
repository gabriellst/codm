namespace TemplateContracts;

@doc("A contact's overall availability signal on a channel. Descends the origin channel PresenceType (whatsmeow *events.Presence). Defined-and-dormant: the presence_updated wire event carries the raw `unavailable` boolean + `lastSeen`; this enum is the harmonized closed set for consumers that want a named state.")
enum PresenceType {
  AVAILABLE: "AVAILABLE",
  UNAVAILABLE: "UNAVAILABLE",
  COMPOSING: "COMPOSING",
  RECORDING: "RECORDING",
  PAUSED: "PAUSED",
}
