namespace TemplateContracts;

@doc("Discriminator for a platform-specific out-of-band event carried by channel_special_platform_event.received. Descends the origin channel ChannelSpecialPlatformEventType. Lowercase wire value preserved verbatim. qr_code_updated is realized concretely by the frozen pairing_qr_updated event; this generic envelope + enum is defined-and-dormant for future platform-native events.")
enum SpecialPlatformEventType {
  QR_CODE_UPDATED: "qr_code_updated",
}
