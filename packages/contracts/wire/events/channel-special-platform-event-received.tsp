import "./_base.tsp";
import "../lib/union-slots.tsp";

namespace TemplateContracts;

@doc("BC1 Channel Gateway. A generic envelope for a platform-native out-of-band event. Descends the medscall integration.channel_special_platform_event.received. Flat-events sanctioned amendment (wire-identity invariant, pilot precedent): the payload is the VERBATIM gateway shape — `eventName` keeps its wire key (the earlier platformEventName rename would change the marshaled key; the generated FLAT struct renames only the Go field ident to dodge the EventName() method collision) and `payload` is an opaque union SLOT carrying the platform-native variant object (the earlier payloadJson string re-encoding was never on the wire). The realized variant (WHATSAPP qr_code_updated → WhatsAppQRCodeUpdated) lives in the owner workspace (apiGo).")
@unionSlot("payload", #["platform", "eventType"])
@variant("WHATSAPP", "qr_code_updated", "WhatsAppQRCodeUpdated", #{ owner: "apiGo" })
model ChannelSpecialPlatformEventReceivedEvent extends IntegrationEvent {
  name: "integration.channel_special_platform_event.received";
  @format("uuid")
  channelId: string;
  @doc("Platform-native event name, verbatim (e.g. whatsmeow `*events.QR`).")
  eventName: string;
  eventType: SpecialPlatformEventType;
  @doc("Union discriminator. Verbatim gateway Platform (WHATSAPP | INTERNAL) — kept `string` in the contract: reconciliation with ChannelKind (which lacks INTERNAL) is deferred to the enum-harmonization handoff.")
  platform: string;
  @doc("Union slot — opaque in the contract; the union materializes in codegen from the @unionSlot/@variant declarations above.")
  payload: unknown;
  @doc("Verbatim payload field (redeclares the envelope name on purpose): the wire payload carries the owner in addition to the envelope.")
  ownerId: string;
}
