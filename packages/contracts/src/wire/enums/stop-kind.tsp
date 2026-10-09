namespace TemplateContracts;

@doc("Why an agent stopped and flagged the thread 'Needs you'. Each kind admits a specific set of resolutions (see StopResolution). Only kinds enabled in StopPolicyConfig can be raised.")
enum StopKind {
  SERVER_ERROR: "SERVER_ERROR",
  BLOCKED_BY_CLASSIFICATION: "BLOCKED_BY_CLASSIFICATION",
  HUMAN_REQUESTED: "HUMAN_REQUESTED",
  APPROVAL_NEEDED: "APPROVAL_NEEDED",
  // Phase-10 amendment: the provider CLI needs re-authentication (e.g. claude asks for /login).
  // Raised by the terminal engine when a session cannot proceed without the human re-authing the
  // CLI; admissible resolutions are RETRY (after re-login) and TAKE_OVER (see RESOLUTIONS_BY_KIND).
  AUTH_REQUIRED: "AUTH_REQUIRED",
  // Participant-permission-posture amendment: the CLI's permission filter blocked an action in a turn
  // running under PermissionPosture.AUTO. TRANSPORT — observed by the runner on the terminal frame
  // (`safety_stops` / `permission_denials`), never declared by a tool. Recorded at once, never retried
  // (a retry under the same posture repeats the denial); resolutions APPROVE / DENY / TAKE_OVER.
  PERMISSION_DENIED: "PERMISSION_DENIED",
}
