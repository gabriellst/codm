import "./_base.tsp";

namespace TemplateContracts;

@doc("BC1 Channel Gateway -> BC4 Thread & Routing. A channel session was torn down; the core parks the affected threads. Descends medscall integration.channel.disconnected.")
model ChannelDisconnectedEvent extends IntegrationEvent {
  name: "integration.channel.disconnected";
  channelId: string;
  kind: ChannelKind;
  affectedThreadIds: string[];
}
