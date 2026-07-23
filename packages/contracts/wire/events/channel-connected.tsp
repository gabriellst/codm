import "./_base.tsp";

namespace TemplateContracts;

@doc("BC1 Channel Gateway -> BC4 Thread & Routing. A channel finished pairing and is reachable. Descends medscall integration.channel.connected. Flat-events sanctioned amendment (wire-identity invariant, pilot precedent): the payload is the VERBATIM gateway shape — the earlier aspirational harmonized shape (kind/accountDetail/pairedAt) was never on the wire; kind→ChannelKind reconciliation and any shape harmonization are deferred to the enum-harmonization handoff.")
model ChannelConnectedEvent extends IntegrationEvent {
  name: "integration.channel.connected";
  @format("uuid")
  channelId: string;
  @doc("Verbatim gateway Platform (WHATSAPP | INTERNAL) — kept `string` in the contract: reconciliation with ChannelKind (which lacks INTERNAL) is deferred to the enum-harmonization handoff.")
  platform: string;
  @doc("Per-platform opaque data. The gateway mapper never sets it today (omitted on the wire); declared to keep the binding verbatim-compatible.")
  platformData?: unknown;
  @doc("Verbatim payload field (redeclares the envelope name on purpose): the wire payload carries the owner in addition to the envelope.")
  ownerId: string;
}
