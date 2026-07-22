import "./_base.tsp";

namespace TemplateContracts;

@doc("BC1 Channel Gateway. Progress metrics for an ongoing sync session. Descends the medscall integration.channel.sync_progress. historySyncType names the whatsmeow batch class (initial | recent); percent is 0-100. ownerId travels on the envelope.")
model ChannelSyncProgressEvent extends IntegrationEvent {
  name: "integration.channel.sync_progress";
  channelId: string;
  historySyncType: HistorySyncType;
  percent: int32;
}
