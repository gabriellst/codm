namespace TemplateContracts;

@doc("Delivery surface for a notification. A single Notification may fan out to multiple channels via separate NotificationDelivery rows.")
enum NotificationChannel {
  PUSH: "PUSH",
  EMAIL: "EMAIL",
  IN_APP: "IN_APP",
}
