namespace TemplateContracts;

@doc("Messaging platform a Channel bridges. Frozen for three (founder decision 4); only WHATSAPP is realized in the first gateway phase — INSTAGRAM_DM and TELEGRAM are reserved variants. Descends the medscall Platform enum. Persisted on channel-side projections (Go-owned).")
enum ChannelKind {
  WHATSAPP: "WHATSAPP",
  INSTAGRAM_DM: "INSTAGRAM_DM",
  TELEGRAM: "TELEGRAM",
}
