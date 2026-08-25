namespace TemplateContracts;

@doc("Whether a gateway message row is outbound (SENT by the owner) or inbound (RECEIVED). Descends the origin channel Direction. The gateway.messages projector derives it from which lifecycle event drove the row (channel_message.sent -> SENT, channel_message.received -> RECEIVED); persisted as the `direction` column.")
enum Direction {
  SENT: "SENT",
  RECEIVED: "RECEIVED",
}
