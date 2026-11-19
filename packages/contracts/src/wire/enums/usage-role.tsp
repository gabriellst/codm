namespace TemplateContracts;

@doc("Who spent provider quota on a turn (fase 4, item 2). The budget sums spend by role and keeps a free floor for the orchestrator. ORCHESTRATOR: a conversation turn of the orchestrator. ISSUE: a turn of an issue's session. TRIAGE: the small-model triage of an inbound message. SUPERVISOR (fase 5): the small-model supervisor reviewing a suspect task — inside the orchestrator's reserve.")
enum UsageRole {
  ORCHESTRATOR: "ORCHESTRATOR",
  ISSUE: "ISSUE",
  TRIAGE: "TRIAGE",
  SUPERVISOR: "SUPERVISOR",
}
