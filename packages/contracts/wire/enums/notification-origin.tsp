namespace TemplateContracts;

@doc("Who emitted a notification — distinguishes auto-system, admin-broadcasts, and scheduler-driven recurrences (e.g. daily digest).")
enum NotificationOrigin {
  SYSTEM: "SYSTEM",
  ADMIN: "ADMIN",
  SCHEDULER: "SCHEDULER",
}
