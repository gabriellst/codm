namespace TemplateContracts;

@doc("Kind of payload a channel message carries. Descends the medscall channel MessageType — the full whatsmeow-derived surface is ported verbatim; only TEXT is exercised in the first gateway phase, the rest are defined-and-dormant. Materialized on the gateway.messages projection's content union (contentJson is the serialized variant).")
enum MessageType {
  TEXT: "TEXT",
  IMAGE: "IMAGE",
  VIDEO: "VIDEO",
  AUDIO: "AUDIO",
  DOCUMENT: "DOCUMENT",
  STICKER: "STICKER",
  LOCATION: "LOCATION",
  CONTACT: "CONTACT",
  POLL: "POLL",
  LIST: "LIST",
  BUTTON: "BUTTON",
  REACTION: "REACTION",
  STATUS: "STATUS",
}
