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
}
