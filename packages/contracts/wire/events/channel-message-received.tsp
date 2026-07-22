import "./_base.tsp";

namespace TemplateContracts;

@doc("BC1 Channel Gateway -> BC4 Thread & Routing. A normalized inbound message on a connected channel. Descends medscall integration.channel_message.received. The ContactRef VO is flattened to scalar contact* fields (the wire codegen carries scalars + enums, not nested models); the core reassembles it. `receivedAt` is when the platform says the message was sent. ownerId travels on the envelope.")
model ChannelMessageReceivedEvent extends IntegrationEvent {
  name: "integration.channel_message.received";
  // Top-level channel binding. The draft's ContactRef VO carried a nested `contactRef.channelId`;
  // that sub-field is intentionally represented by this bare top-level `channelId` (the channel the
  // message arrived on), matching ThreadAttachedEvent.channelId and the `channel_id` column on the
  // threads table. Only the contact* fields are the flattened ContactRef VO.
  @doc("The channel this message arrived on (top-level binding; intentionally represents the draft ContactRef.channelId sub-field).")
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
