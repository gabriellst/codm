namespace TemplateContracts;

@doc("Why an agent stopped and flagged the thread 'Needs you'. Each kind admits a specific set of resolutions (see StopResolution). Only kinds enabled in StopPolicyConfig can be raised.")
enum StopKind {
  SERVER_ERROR: "SERVER_ERROR",
  BLOCKED_BY_CLASSIFICATION: "BLOCKED_BY_CLASSIFICATION",
  HUMAN_REQUESTED: "HUMAN_REQUESTED",
  APPROVAL_NEEDED: "APPROVAL_NEEDED",
}
