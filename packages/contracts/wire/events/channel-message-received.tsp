import "./_base.tsp";
import "../lib/union-slots.tsp";

namespace TemplateContracts;

@doc("BC1 Channel Gateway -> BC4 Thread & Routing. A normalized inbound message on a connected channel — the union-slots PILOT (spec RATIFIED 2026-07-22): fields are the stable verbatim gateway payload (medscall channel.message_received); `content` and `platformData` are opaque union SLOTS whose variant shapes live in the owner workspace (apiGo) and reach consumers only through the owner's generated client schemas. The payload redeclares `ownerId`/`occurredAt` on purpose: the verbatim wire payload carries them INSIDE the payload in addition to the envelope. `occurredAt` is when the platform says the message was sent; `observedAt` is when our gateway learned about it.")
@unionSlot("content", #["platform", "messageType"])
@variant("WHATSAPP", "TEXT", "WhatsAppTextContent", #{ owner: "apiGo" })
@variant("WHATSAPP", "IMAGE", "WhatsAppImageContent", #{ owner: "apiGo" })
@variant("WHATSAPP", "VIDEO", "WhatsAppVideoContent", #{ owner: "apiGo" })
@variant("WHATSAPP", "AUDIO", "WhatsAppAudioContent", #{ owner: "apiGo" })
@variant("WHATSAPP", "DOCUMENT", "WhatsAppDocumentContent", #{ owner: "apiGo" })
@variant("WHATSAPP", "STICKER", "WhatsAppStickerContent", #{ owner: "apiGo" })
@variant("WHATSAPP", "LOCATION", "WhatsAppLocationContent", #{ owner: "apiGo" })
@variant("WHATSAPP", "CONTACT", "WhatsAppContactContent", #{ owner: "apiGo" })
@variant("WHATSAPP", "POLL", "WhatsAppPollContent", #{ owner: "apiGo" })
@variant("WHATSAPP", "REACTION", "WhatsAppReactionContent", #{ owner: "apiGo" })
@variant("INTERNAL", "TEXT", "InternalTextContent", #{ owner: "apiGo" })
@unionSlot("platformData", #["platform"])
@variant("WHATSAPP", "WhatsAppChannelMessageReceivedPlatformData", #{ owner: "apiGo" })
@variant("INTERNAL", "InternalChannelMessageReceivedPlatformData", #{ owner: "apiGo" })
model ChannelMessageReceivedEvent extends IntegrationEvent {
  name: "integration.channel_message.received";
  @doc("The channel this message arrived on.")
  @format("uuid")
  channelId: string;
  @doc("Platform-scoped message id (e.g. the WhatsApp wamid).")
  messageId: string;
  @format("uuid")
  internalMessageId: string;
  @doc("Canonical counterparty id — the chat (user PN or group JID) the message belongs to.")
  remoteId: string;
  senderId: string;
  fromMe: boolean;
  isGroup: boolean;
  @doc("Platform timestamp, unix seconds.")
  timestamp: int64;
  @doc("Verbatim payload field (redeclares the envelope name on purpose): when the platform says the message was sent.")
  @encode("rfc3339", string)
  occurredAt: utcDateTime;
  @doc("When our gateway learned about the message.")
  @encode("rfc3339", string)
  observedAt: utcDateTime;
  messageType: MessageType;
  @doc("Union slot — opaque in the contract; the union materializes in codegen from the @unionSlot/@variant declarations above.")
  content?: unknown;
  @doc("Union discriminator. Verbatim gateway Platform (WHATSAPP | INTERNAL) — kept `string` in the contract: reconciliation with ChannelKind (which lacks INTERNAL) is deferred to the enum-harmonization handoff and is NOT part of this sanctioned amendment.")
  platform: string;
  @doc("Union slot — opaque in the contract; see `content`.")
  platformData?: unknown;
  @doc("Verbatim payload field (redeclares the envelope name on purpose): the payload carries the owner in addition to the envelope.")
  ownerId: string;
}
