import "./_base.tsp";

namespace TemplateContracts;

@doc("BC1 Channel Gateway. A recipient device received one or more of the owner's messages in a chat. Descends the medscall integration.channel_message.delivered. Timestamp is a watermark — every owner message in the chat with message_timestamp <= timestamp is considered delivered to senderId; the gateway.messages read model advances delivered_at. messageIds may be empty (bare online-ack), single, or batched. ownerId travels on the envelope.")
model ChannelMessageDeliveredEvent extends IntegrationEvent {
  name: "integration.channel_message.delivered";
  @format("uuid")
  channelId: string;
  remoteId: string;
  senderId: string;
  messageIds: string[];
  timestamp: int64;
  @doc("Verbatim gateway Platform (WHATSAPP | INTERNAL) — kept `string` in the contract: reconciliation with ChannelKind (which lacks INTERNAL) is deferred to the enum-harmonization handoff and is NOT part of this sanctioned flat-events amendment (pilot precedent).")
  platform: string;
  @doc("Verbatim payload field (redeclares the envelope name on purpose): the wire payload carries the owner in addition to the envelope.")
  ownerId: string;
}
