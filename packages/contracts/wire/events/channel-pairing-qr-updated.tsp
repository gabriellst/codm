import "./_base.tsp";

namespace TemplateContracts;

@doc("BC1 Channel Gateway -> BC4 Thread & Routing. A fresh pairing QR/token was produced (rotates ~every 30s). Descends medscall WhatsAppQRCodeUpdated; drives the T06 live QR over SSE.")
model ChannelPairingQrUpdatedEvent extends IntegrationEvent {
  name: "integration.channel.pairing_qr_updated";
  channelId: string;
  kind: ChannelKind;
  qrPayload: string;
  @encode("rfc3339", string)
  qrExpiresAt: utcDateTime;
}
