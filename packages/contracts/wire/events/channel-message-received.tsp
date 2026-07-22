import "./_base.tsp";

namespace TemplateContracts;

@doc("BC1 Channel Gateway -> BC4 Thread & Routing. A normalized inbound message on a connected channel. Descends medscall integration.channel_message.received. The ContactRef VO is flattened to scalar contact* fields (the wire codegen carries scalars + enums, not nested models); the core reassembles it. `receivedAt` is when the platform says the message was sent. ownerId travels on the envelope.")
model ChannelMessageReceivedEvent extends IntegrationEvent {
  name: "integration.channel_message.received";
  channelId: string;
  messageId: string;
  contactExternalId: string;
  contactDisplayName: string;
  contactKind: ContactKind;
  senderExternalId: string;
  isGroup: boolean;
  text: string;
  quotedEntryId?: string;
  platform: ChannelKind;
  @encode("rfc3339", string)
  receivedAt: utcDateTime;
}
