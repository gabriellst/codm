import "./_base.tsp";

namespace TemplateContracts;

@doc("BC1 Channel Gateway. A remote was soft-deleted (contact removed / left permanently). Descends the medscall integration.channel.remote_deleted. The gateway.remotes read model stamps deleted_at without removing the row. ownerId travels on the envelope.")
model ChannelRemoteDeletedEvent extends IntegrationEvent {
  name: "integration.channel.remote_deleted";
  channelId: string;
  remoteId: string;
  @encode("rfc3339", string)
  deletedAt: utcDateTime;
}
