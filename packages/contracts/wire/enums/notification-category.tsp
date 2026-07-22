namespace TemplateContracts;

@doc("High-level kind of notification — drives template selection + per-user opt-in checks.")
enum NotificationCategory {
  ORDER_RECEIVED: "ORDER_RECEIVED",
  SYNC_ERROR: "SYNC_ERROR",
  FEATURE_ANNOUNCEMENT: "FEATURE_ANNOUNCEMENT",
  DAILY_DIGEST: "DAILY_DIGEST",
  INTEGRATION_DISCONNECTED: "INTEGRATION_DISCONNECTED",
  INVITATION: "INVITATION",
  OTHER: "OTHER",
}
