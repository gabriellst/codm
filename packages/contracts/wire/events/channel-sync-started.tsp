import "./_base.tsp";

namespace TemplateContracts;

@doc("BC1 Channel Gateway. A sync session began. Descends the medscall integration.channel.sync_started. ownerId travels on the envelope.")
model ChannelSyncStartedEvent extends IntegrationEvent {
  name: "integration.channel.sync_started";
  channelId: string;
  @encode("rfc3339", string)
  startedAt: utcDateTime;
}
