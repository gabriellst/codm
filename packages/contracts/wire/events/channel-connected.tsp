import "./_base.tsp";

namespace TemplateContracts;

@doc("BC1 Channel Gateway -> BC4 Thread & Routing. A channel finished pairing and is reachable. Descends medscall integration.channel.connected.")
model ChannelConnectedEvent extends IntegrationEvent {
  name: "integration.channel.connected";
  channelId: string;
  kind: ChannelKind;
  accountDetail: string;
  pairedAt: utcDateTime;
}
