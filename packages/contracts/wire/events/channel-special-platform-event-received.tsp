import "./_base.tsp";

namespace TemplateContracts;

@doc("BC1 Channel Gateway. A generic envelope for a platform-native out-of-band event. Descends the medscall integration.channel_special_platform_event.received. Defined-and-dormant: the only realized variant (qr_code_updated) is served concretely by the frozen pairing_qr_updated event; this wrapper carries eventType (SpecialPlatformEventType) + an opaque JSON-serialized payload (payloadJson) for future platform events. The source field `eventName` is renamed platformEventName to avoid colliding with the generated Go EventName() discriminator method. ownerId travels on the envelope.")
model ChannelSpecialPlatformEventReceivedEvent extends IntegrationEvent {
  name: "integration.channel_special_platform_event.received";
  channelId: string;
  platformEventName: string;
  eventType: SpecialPlatformEventType;
  platform: ChannelKind;
  payloadJson: string;
}
