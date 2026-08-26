import "./_base.tsp";

namespace TemplateContracts;

@doc("BC1 Channel Gateway. Messages in a chat were read or played. Descends the origin integration.channel_message.seen — covers whatsmeow read / played / read-self (self=true, owner read on another device) receipts. Timestamp is a watermark; the gateway.messages read model advances seen_at for every owner message with message_timestamp <= timestamp. self=true rows drive multi-device chat-seen sync; senderId != owner rows drive per-message blue-tick status. ownerId travels on the envelope.")
model ChannelMessageSeenEvent extends IntegrationEvent {
  name: "integration.channel_message.seen";
  @format("uuid")
  channelId: string;
  remoteId: string;
  senderId: string;
  messageIds: string[];
  timestamp: int64;
  self: boolean;
  @doc("Verbatim gateway Platform (WHATSAPP | INTERNAL) — kept `string` in the contract: reconciliation with ChannelKind (which lacks INTERNAL) is deferred to the enum-harmonization handoff and is NOT part of this sanctioned flat-events amendment (pilot precedent).")
  platform: string;
  @doc("Verbatim payload field (redeclares the envelope name on purpose): the wire payload carries the owner in addition to the envelope.")
  ownerId: string;
}
