import "./_base.tsp";

namespace TemplateContracts;

@doc("BC1 Channel Gateway -> BC4 Thread & Routing. A channel session was torn down; the core parks the affected threads. Descends medscall integration.channel.disconnected. Flat-events sanctioned amendment (wire-identity invariant, pilot precedent): the payload is the VERBATIM gateway shape — the earlier aspirational harmonized shape (kind/affectedThreadIds) was never on the wire; affected-thread derivation is a consumer-side read, and kind→ChannelKind reconciliation is deferred to the enum-harmonization handoff.")
model ChannelDisconnectedEvent extends IntegrationEvent {
  name: "integration.channel.disconnected";
  @format("uuid")
  channelId: string;
  @doc("Verbatim gateway Platform (WHATSAPP | INTERNAL) — kept `string` in the contract: reconciliation with ChannelKind (which lacks INTERNAL) is deferred to the enum-harmonization handoff.")
  platform: string;
  @doc("Per-platform opaque data. The gateway mapper never sets it today (omitted on the wire); declared to keep the binding verbatim-compatible.")
  platformData?: unknown;
  @doc("Verbatim payload field (redeclares the envelope name on purpose): the wire payload carries the owner in addition to the envelope.")
  ownerId: string;
}
