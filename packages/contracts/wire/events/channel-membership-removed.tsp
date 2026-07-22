import "./_base.tsp";

namespace TemplateContracts;

@doc("BC1 Channel Gateway. A participant left (or was removed from) a group. Descends the medscall integration.channel.membership_removed. Deletes the matching gateway.remote_memberships row. ownerId travels on the envelope.")
model ChannelMembershipRemovedEvent extends IntegrationEvent {
  name: "integration.channel.membership_removed";
  channelId: string;
  groupId: string;
  memberId: string;
  @encode("rfc3339", string)
  removedAt: utcDateTime;
}
