namespace TemplateContracts;

@doc("Typing/recording indicator inside a specific chat. Descends the origin channel ChatPresenceType (whatsmeow *events.ChatPresence). Lowercase wire values are preserved verbatim from the source. Carried by the chat_presence_updated wire event's `state` field.")
enum ChatPresenceType {
  COMPOSING: "composing",
  RECORDING: "recording",
  PAUSED: "paused",
}
