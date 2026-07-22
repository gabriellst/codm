import "./_base.tsp";

namespace TemplateContracts;

@doc("BC1 Channel Gateway. The platform forcibly logged the gateway session out (device unlinked, ban, credential revocation) — distinct from a graceful disconnect. Descends the medscall integration.channel.logged_out. reason is the platform-supplied cause; platformData is dropped (per-platform opaque). ownerId travels on the envelope.")
model ChannelLoggedOutEvent extends IntegrationEvent {
  name: "integration.channel.logged_out";
  channelId: string;
  reason: string;
  platform: ChannelKind;
}
