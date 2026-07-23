import "./_base.tsp";

namespace TemplateContracts;

@doc("BC1 Channel Gateway. A sync session finished. Descends the medscall integration.channel.sync_completed. ownerId travels on the envelope.")
model ChannelSyncCompletedEvent extends IntegrationEvent {
  name: "integration.channel.sync_completed";
  @format("uuid")
  channelId: string;
  @doc("Verbatim payload field (redeclares the envelope name on purpose; declared before completedAt to preserve the marshaled key order): the wire payload carries the owner in addition to the envelope.")
  ownerId: string;
  @encode("rfc3339", string)
  completedAt: utcDateTime;
}
