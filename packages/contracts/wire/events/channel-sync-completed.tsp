import "./_base.tsp";

namespace TemplateContracts;

@doc("BC1 Channel Gateway. A sync session finished. Descends the medscall integration.channel.sync_completed. ownerId travels on the envelope.")
model ChannelSyncCompletedEvent extends IntegrationEvent {
  name: "integration.channel.sync_completed";
  channelId: string;
  @encode("rfc3339", string)
  completedAt: utcDateTime;
}
