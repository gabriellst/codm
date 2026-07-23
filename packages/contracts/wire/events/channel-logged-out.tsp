import "./_base.tsp";

namespace TemplateContracts;

@doc("BC1 Channel Gateway. The platform forcibly logged the gateway session out (device unlinked, ban, credential revocation) — distinct from a graceful disconnect. Descends the medscall integration.channel.logged_out. reason is the platform-supplied cause. Flat-events sanctioned amendment (wire-identity invariant, pilot precedent): platformData and the redeclared ownerId are the verbatim gateway payload fields.")
model ChannelLoggedOutEvent extends IntegrationEvent {
  name: "integration.channel.logged_out";
  @format("uuid")
  channelId: string;
  reason: string;
  @doc("Verbatim gateway Platform (WHATSAPP | INTERNAL) — kept `string` in the contract: reconciliation with ChannelKind (which lacks INTERNAL) is deferred to the enum-harmonization handoff.")
  platform: string;
  @doc("Per-platform opaque data. The gateway mapper never sets it today (omitted on the wire); declared to keep the binding verbatim-compatible.")
  platformData?: unknown;
  @doc("Verbatim payload field (redeclares the envelope name on purpose): the wire payload carries the owner in addition to the envelope.")
  ownerId: string;
}
