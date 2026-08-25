import "./_base.tsp";

namespace TemplateContracts;

@doc("BC1 Channel Gateway. Progress metrics for an ongoing sync session. Descends the origin integration.channel.sync_progress. historySyncType names the whatsmeow batch class (initial | recent); percent is 0-100. ownerId travels on the envelope.")
model ChannelSyncProgressEvent extends IntegrationEvent {
  name: "integration.channel.sync_progress";
  @format("uuid")
  channelId: string;
  @doc("Verbatim payload field (redeclares the envelope name on purpose; declared before historySyncType to preserve the marshaled key order): the wire payload carries the owner in addition to the envelope.")
  ownerId: string;
  historySyncType: HistorySyncType;
  percent: int32;
}
