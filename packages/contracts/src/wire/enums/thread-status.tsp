namespace TemplateContracts;

@doc("Aggregate operating status of a Thread, derived from its issues + pause state. Drives the sidebar pill and Home cards. Referenced by the browser thread-status SSE frame.")
enum ThreadStatus {
  RUNNING: "RUNNING",
  IDLE: "IDLE",
  NEEDS_ATTENTION: "NEEDS_ATTENTION",
  PAUSED: "PAUSED",
}
