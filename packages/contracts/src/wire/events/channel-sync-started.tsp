import "./_base.tsp";

namespace TemplateContracts;

@doc("BC1 Channel Gateway. A sync session began. Descends the origin integration.channel.sync_started. ownerId travels on the envelope.")
model ChannelSyncStartedEvent extends IntegrationEvent {
  name: "integration.channel.sync_started";
  @format("uuid")
  channelId: string;
  @doc("Verbatim payload field (redeclares the envelope name on purpose; declared before startedAt to preserve the marshaled key order): the wire payload carries the owner in addition to the envelope.")
  ownerId: string;
  @encode("rfc3339", string)
  startedAt: utcDateTime;
}
