import "./_base.tsp";

namespace TemplateContracts;

@doc("BC1 Channel Gateway. A participant joined a group. Descends the origin integration.channel.membership_added. Writes a gateway.remote_memberships row (channelId, groupId, memberId). isAdmin captures the join-time role; the promoted/demoted transitions are modeled by the dormant MembershipAction enum. ownerId travels on the envelope.")
model ChannelMembershipAddedEvent extends IntegrationEvent {
  name: "integration.channel.membership_added";
  @format("uuid")
  channelId: string;
  groupId: string;
  memberId: string;
  isAdmin: boolean;
  @encode("rfc3339", string)
  joinedAt: utcDateTime;
  @doc("Verbatim payload field (redeclares the envelope name on purpose): the wire payload carries the owner in addition to the envelope.")
  ownerId: string;
}
