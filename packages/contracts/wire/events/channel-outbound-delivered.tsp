import "./_base.tsp";

namespace TemplateContracts;

@doc("BC1 Channel Gateway -> BC4 Thread & Routing. An outbound message was delivered to the channel (optimistic emit). Descends medscall channel.message_sent. The ContactRef and the optional IssueLabel are flattened to scalar fields; label* is present only on agent replies.")
model ChannelOutboundDeliveredEvent extends IntegrationEvent {
  name: "integration.channel.outbound_delivered";
  channelId: string;
  contactExternalId: string;
  contactDisplayName: string;
  contactKind: ContactKind;
  labelIssueKey?: string;
  labelThreadId?: string;
  senderIdentity: SenderIdentity;
  @encode("rfc3339", string)
  deliveredAt: utcDateTime;
}
